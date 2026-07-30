/**
 * Compact-mode reshaping for event hit lists.
 *
 * Raw SaaS Alerts events run ~3 KB each (nested location.ipInfo threat-intel,
 * PSA ticket blobs, device unify metadata), which breaks clients at 50+ events
 * per response. Compact mode keeps an allowlist of triage-useful fields and
 * flattens `location` to a one-line summary. `verbose: true` bypasses all of
 * this at the tool layer.
 *
 * Defensive rule: anything that does not look like a full event (e.g. an
 * advanced query projected via Elasticsearch `_source` filtering) is passed
 * through unchanged — the transform reshapes what it recognizes and never
 * destroys what it doesn't.
 */

/** Field allowlist, derived from the IEvent schema in the SaaS Alerts OpenAPI spec. */
const COMPACT_FIELDS = [
  '_id',
  'eventId',
  'time',
  'type',
  'jointType',
  'alertStatus',
  'status',
  'jointDesc',
  'jointDescAdditional',
  'operation',
  'user',
  'userEmail',
  'email',
  'customer',
  'product',
  'appName',
  'ip',
] as const;

export const COMPACT_NOTE =
  'Events compacted to triage fields; pass verbose: true for full raw records.';

/**
 * Cap on the serialized size of a compact-mode response, in characters as the
 * MCP layer emits it (`ok()` pretty-prints with `JSON.stringify(data, null, 2)`).
 * Per-event compaction cannot bound total size when the record count is
 * unbounded — clients break somewhere below 64 KB, so responses over this
 * budget keep only the first events that fit.
 */
export const MAX_COMPACT_RESPONSE_CHARS = 40_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A full event (per the IEvent schema) always carries a timestamp and a type/severity. */
function isFullEvent(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.time !== undefined &&
    (value.alertStatus !== undefined || value.type !== undefined || value.jointType !== undefined)
  );
}

/** Flatten ILocation to a one-line "city, region, country" summary. */
function locationSummary(location: unknown): string | undefined {
  if (!isRecord(location)) return undefined;
  const parts = [location.city, location.region, location.country].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Reduce a recognized event to the triage allowlist. Unrecognized values are
 * returned unchanged (same reference), so callers can detect no-ops with `!==`.
 */
export function compactEvent(event: unknown): unknown {
  if (!isFullEvent(event)) return event;
  const compact: Record<string, unknown> = {};
  for (const field of COMPACT_FIELDS) {
    if (event[field] !== undefined && event[field] !== null) compact[field] = event[field];
  }
  const location = locationSummary(event.location);
  if (location !== undefined) compact.location = location;
  return compact;
}

/** Compact each element of a hit array; elements may be bare events or ES hits with `_source`. */
function compactHits(hits: unknown[]): { hits: unknown[]; changed: boolean } {
  let changed = false;
  const out = hits.map(hit => {
    if (isRecord(hit) && isFullEvent(hit._source)) {
      changed = true;
      return { ...hit, _source: compactEvent(hit._source) };
    }
    const compact = compactEvent(hit);
    if (compact !== hit) changed = true;
    return compact;
  });
  return { hits: out, changed };
}

/** Serialized length exactly as the MCP layer emits it (`ok()` uses 2-space indent). */
function serializedLength(data: unknown): number {
  return JSON.stringify(data, null, 2).length;
}

/**
 * Note for a truncated response. Scroll cursors are server-side and have
 * already advanced past every event fetched this page — including the ones
 * trimmed here — so continuing the scroll skips them; the only way to see
 * them is a re-query with a smaller size.
 */
function truncationNote(kept: number, fetched: number, hasScrollCursor: boolean): string {
  const shown = `Showing ${kept} of ${fetched} events (response size cap); events compacted to triage fields.`;
  return hasScrollCursor
    ? `${shown} The server-side scroll cursor has already advanced past all ${fetched} fetched events, so continuing the scroll will NOT return the trimmed ones — re-run the query with a smaller size to see them.`
    : `${shown} Narrow the date range, lower size, or paginate with from/size to see the rest.`;
}

/**
 * Keep the largest prefix of `hits` whose built response serializes within
 * MAX_COMPACT_RESPONSE_CHARS — but always at least one event, even if that
 * single event alone exceeds the budget. `build` must produce the complete
 * response (truncation note included) for a given kept-prefix.
 *
 * Linear accumulation over per-event serialized sizes picks a candidate K; it
 * ignores nesting indentation and separators, so it can only over-admit — the
 * verify loop then trims against real full-response measurements.
 */
function fitToBudget(hits: unknown[], build: (kept: unknown[]) => unknown): unknown {
  const budget = MAX_COMPACT_RESPONSE_CHARS - serializedLength(build([]));
  let kept = 0;
  let used = 0;
  for (const hit of hits) {
    used += serializedLength(hit);
    if (used > budget) break;
    kept++;
  }
  kept = Math.max(1, kept);
  while (kept > 1 && serializedLength(build(hits.slice(0, kept))) > MAX_COMPACT_RESPONSE_CHARS) {
    kept--;
  }
  return build(hits.slice(0, kept));
}

/**
 * Compact per-event records in an events response while preserving all
 * response-level metadata (totals, shard stats, scroll IDs, pagination).
 * Handles the two real shapes: a bare event array (`GET /reports/events`) and
 * the Elasticsearch envelope (`POST /reports/events/query` and scroll).
 * Returns the input unchanged when nothing was recognized as an event.
 *
 * Compacted responses are additionally capped at MAX_COMPACT_RESPONSE_CHARS:
 * over-budget hit lists keep only the first K events that fit (the API already
 * applied time_sort), with a note saying how to get the rest. Unrecognized
 * responses keep the pass-through guarantee and are never truncated.
 */
export function compactEventsResponse(data: unknown): unknown {
  if (Array.isArray(data)) {
    const { hits, changed } = compactHits(data);
    if (!changed) return data;
    const full = { note: COMPACT_NOTE, events: hits };
    if (serializedLength(full) <= MAX_COMPACT_RESPONSE_CHARS) return full;
    return fitToBudget(hits, kept => ({
      note: truncationNote(kept.length, hits.length, false),
      events: kept,
    }));
  }

  if (isRecord(data)) {
    const hasScrollCursor = typeof data._scroll_id === 'string';
    // Envelope hits: either `hits: [...]` or the ES `hits: { total, hits: [...] }`.
    if (Array.isArray(data.hits)) {
      const { hits, changed } = compactHits(data.hits);
      if (!changed) return data;
      const full = { note: COMPACT_NOTE, ...data, hits };
      if (serializedLength(full) <= MAX_COMPACT_RESPONSE_CHARS) return full;
      return fitToBudget(hits, kept => ({
        note: truncationNote(kept.length, hits.length, hasScrollCursor),
        ...data,
        hits: kept,
      }));
    }
    if (isRecord(data.hits) && Array.isArray(data.hits.hits)) {
      const envelope = data.hits;
      const { hits, changed } = compactHits(data.hits.hits);
      if (!changed) return data;
      const full = { note: COMPACT_NOTE, ...data, hits: { ...envelope, hits } };
      if (serializedLength(full) <= MAX_COMPACT_RESPONSE_CHARS) return full;
      return fitToBudget(hits, kept => ({
        note: truncationNote(kept.length, hits.length, hasScrollCursor),
        ...data,
        hits: { ...envelope, hits: kept },
      }));
    }
  }

  return data;
}
