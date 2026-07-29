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

/**
 * Compact per-event records in an events response while preserving all
 * response-level metadata (totals, shard stats, scroll IDs, pagination).
 * Handles the two real shapes: a bare event array (`GET /reports/events`) and
 * the Elasticsearch envelope (`POST /reports/events/query` and scroll).
 * Returns the input unchanged when nothing was recognized as an event.
 */
export function compactEventsResponse(data: unknown): unknown {
  if (Array.isArray(data)) {
    const { hits, changed } = compactHits(data);
    return changed ? { note: COMPACT_NOTE, events: hits } : data;
  }

  if (isRecord(data)) {
    // Envelope hits: either `hits: [...]` or the ES `hits: { total, hits: [...] }`.
    if (Array.isArray(data.hits)) {
      const { hits, changed } = compactHits(data.hits);
      return changed ? { note: COMPACT_NOTE, ...data, hits } : data;
    }
    if (isRecord(data.hits) && Array.isArray(data.hits.hits)) {
      const { hits, changed } = compactHits(data.hits.hits);
      return changed ? { note: COMPACT_NOTE, ...data, hits: { ...data.hits, hits } } : data;
    }
  }

  return data;
}
