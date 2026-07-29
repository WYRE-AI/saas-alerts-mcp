import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compactEvent, compactEventsResponse } from '../utils/compact.js';

const mockClient = {
  events: {
    query: vi.fn(),
    count: vi.fn(),
    queryAdvanced: vi.fn(),
    countAdvanced: vi.fn(),
    scroll: vi.fn(),
    recommendedActions: vi.fn(),
  },
};

vi.mock('../utils/client.js', () => ({
  getClient: () => mockClient,
  getCredentials: () => ({ apiKey: 'test-key' }),
}));

beforeEach(() => vi.clearAllMocks());

/**
 * Realistic full event, assembled from the SaaS Alerts OpenAPI spec
 * (IEvent + ILocation, SwaggerHub SaaS_Alerts/functions) — the same shape the
 * customer's oversized responses carried, including the location.ipInfo blob.
 */
function fullEvent(): Record<string, unknown> {
  return {
    _id: '788195cbfa4f4f9da1af7083789e5a1f',
    eventId: '2fb6b5e31448e8adb013783737f15cft',
    correlationId: '4f9da1af7083789e5a1f788195cbfa4f',
    srcId: '962fb6b5e31448e8adb013783737f15c',
    whBatchId: 'batch-20260724-0001',
    jointType: 'user.login.foreign',
    jointDesc: 'User Login - Foreign Location',
    jointDescAdditional: 'Successful sign-in from outside the approved country list',
    alertStatus: 'critical',
    status: 'active',
    type: 'UserLoggedIn',
    operation: 'UserLoggedIn',
    time: '2026-07-24T19:14:38.405+00:00',
    pullTime: '2026-07-24T19:16:02+00:00',
    itemType: 'event',
    section: 'signIn',
    doNotShow: false,
    workload: 'AzureActiveDirectory',
    companyId: 'comp-001',
    organization: 'contoso.onmicrosoft.com',
    user: {
      id: '14a1fec5-9cc7-4e52-a89b-a12312fefc86',
      name: 'cbuck@contoso.com',
      fullName: 'Charles Buck',
      isLicensed: true,
      accountEnabled: true,
    },
    userEmail: 'cbuck@contoso.com',
    customer: { id: '6FxMluNmiTljhF4x3tZO', name: 'Contoso Ltd' },
    partner: { id: 'coThCxxb3wqZ6gnqYL57', name: 'WYRE Technology', domain: 'saasalerts.com' },
    product: { id: '1cjkEYV8DbfUgqhJ7pL3', name: 'Microsoft', type: 'ms' },
    appName: 'Office 365 Exchange Online',
    applicationId: '00000002-0000-0ff1-ce00-000000000000',
    ip: '185.130.54.55',
    location: {
      country: 'UA',
      city: 'Kyiv',
      region: 'Kyiv City',
      ll: [50.4501, 30.5234],
      ip_owner: 'FOP Hosting LLC',
      type: 'foreign',
      ipInfo: {
        threat: {
          is_bogon: false,
          is_threat: true,
          is_known_abuser: true,
          is_known_attacker: false,
          is_anonymous: true,
          is_proxy: true,
          is_tor: false,
        },
        asn: {
          type: 'hosting',
          route: '185.130.54.0/24',
          domain: 'fophosting.example',
          name: 'FOP-HOSTING',
          asn: 'AS204957',
        },
      },
    },
    device: {
      isMapped: false,
      unifyStatus: 'UNMAPPED',
      sourceInfo: {
        os: 'Windows 10',
        browser: 'Chrome 138.0.0',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        deviceId: 'a89b-a12312fefc86-9cc7',
      },
    },
    psaInfo: [{ status: 'SKIPPED', skipReason: 'NO_MAPPING', type: 'connectwise' }],
    psaTicket: [
      {
        time: '2026-07-24T19:20:00+00:00',
        psaTicketId: 'CW-1029384',
        ticketNumber: '1029384',
        link: 'https://psa.example/tickets/1029384',
        type: 'connectwise',
        creationRetries: 0,
        errors: [],
        emails: ['helpdesk@wyre.example'],
      },
    ],
    ruleTrigger: {
      id: 'rt-01',
      ruleTrigger: 'respond-rule-7',
      triggeredAt: 1753384478405,
      status: 'EXECUTED',
      executedBy: { name: 'respond', id: 'system' },
    },
  };
}

function esEnvelope(sources: Record<string, unknown>[]): Record<string, unknown> {
  return {
    _scroll_id: 'DXF1ZXJ5QW5kRmV0Y2gBAAAAAACHvp4WczhuXzc2TUlRNmFVQ1BMSDE0bmRjUQ==',
    took: 4,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: 36, relation: 'eq' },
      max_score: null,
      hits: sources.map((s, i) => ({
        _index: 'prod_events',
        _type: '_doc',
        _id: `hit-${i}`,
        _score: null,
        _routing: '5NdqrY9GTH808DFJXiUE',
        _source: s,
      })),
    },
  };
}

// ---- compactEvent unit behavior ----
describe('compactEvent', () => {
  it('keeps triage fields and drops location.ipInfo and other nested metadata', () => {
    const compact = compactEvent(fullEvent()) as Record<string, unknown>;

    // identifiers / time / type / severity
    expect(compact._id).toBe('788195cbfa4f4f9da1af7083789e5a1f');
    expect(compact.eventId).toBe('2fb6b5e31448e8adb013783737f15cft');
    expect(compact.time).toBe('2026-07-24T19:14:38.405+00:00');
    expect(compact.type).toBe('UserLoggedIn');
    expect(compact.jointType).toBe('user.login.foreign');
    expect(compact.alertStatus).toBe('critical');
    expect(compact.status).toBe('active');
    // description-like text
    expect(compact.jointDesc).toBe('User Login - Foreign Location');
    expect(compact.jointDescAdditional).toContain('approved country list');
    expect(compact.operation).toBe('UserLoggedIn');
    // identity / customer / product
    expect(compact.user).toEqual(fullEvent().user);
    expect(compact.userEmail).toBe('cbuck@contoso.com');
    expect(compact.customer).toEqual({ id: '6FxMluNmiTljhF4x3tZO', name: 'Contoso Ltd' });
    expect(compact.product).toEqual({ id: '1cjkEYV8DbfUgqhJ7pL3', name: 'Microsoft', type: 'ms' });
    expect(compact.appName).toBe('Office 365 Exchange Online');
    // source IP + flattened one-line location
    expect(compact.ip).toBe('185.130.54.55');
    expect(compact.location).toBe('Kyiv, Kyiv City, UA');

    // dropped blobs
    for (const gone of ['device', 'psaInfo', 'psaTicket', 'ruleTrigger', 'partner', 'pullTime', 'whBatchId']) {
      expect(compact, `${gone} should be dropped`).not.toHaveProperty(gone);
    }
    expect(JSON.stringify(compact)).not.toContain('ipInfo');
  });

  it('omits absent fields rather than emitting undefined/null keys', () => {
    const compact = compactEvent({
      time: '2026-07-24T00:00:00Z',
      alertStatus: 'low',
      location: null,
    }) as Record<string, unknown>;
    expect(compact).not.toHaveProperty('location');
    expect(compact).not.toHaveProperty('ip');
    expect(compact).not.toHaveProperty('userEmail');
  });

  it('passes an unrecognized object through unchanged (same reference)', () => {
    // e.g. an advanced query with _source filtering returned a projection
    const projection = { userEmail: 'x@y.z', location: { ipInfo: { threat: { is_tor: true } } } };
    expect(compactEvent(projection)).toBe(projection);
    const notAnObject = 'plain string hit';
    expect(compactEvent(notAnObject)).toBe(notAnObject);
  });

  it('produces a substantially smaller record than the raw event', () => {
    const raw = fullEvent();
    const rawSize = JSON.stringify(raw, null, 2).length;
    const compactSize = JSON.stringify(compactEvent(raw), null, 2).length;
    expect(compactSize).toBeLessThan(rawSize / 2);
  });
});

// ---- compactEventsResponse shaping ----
describe('compactEventsResponse', () => {
  it('wraps a bare event array as { note, events } with compacted events', () => {
    const out = compactEventsResponse([fullEvent(), fullEvent()]) as Record<string, unknown>;
    expect(typeof out.note).toBe('string');
    expect(out.note).toContain('verbose: true');
    const events = out.events as Record<string, unknown>[];
    expect(events).toHaveLength(2);
    expect(events[0].location).toBe('Kyiv, Kyiv City, UA');
    expect(events[0]).not.toHaveProperty('psaTicket');
  });

  it('preserves ES envelope metadata (totals, shards, scroll id) untouched', () => {
    const envelope = esEnvelope([fullEvent()]);
    const out = compactEventsResponse(envelope) as Record<string, unknown>;
    expect(out._scroll_id).toBe(envelope._scroll_id);
    expect(out.took).toBe(4);
    expect(out.timed_out).toBe(false);
    expect(out._shards).toEqual({ total: 1, successful: 1, skipped: 0, failed: 0 });
    const hits = out.hits as { total: unknown; max_score: unknown; hits: Record<string, unknown>[] };
    expect(hits.total).toEqual({ value: 36, relation: 'eq' });
    expect(hits.max_score).toBeNull();
    // hit metadata preserved, _source compacted
    expect(hits.hits[0]._index).toBe('prod_events');
    expect(hits.hits[0]._id).toBe('hit-0');
    expect(hits.hits[0]._routing).toBe('5NdqrY9GTH808DFJXiUE');
    const source = hits.hits[0]._source as Record<string, unknown>;
    expect(source.alertStatus).toBe('critical');
    expect(source).not.toHaveProperty('device');
    expect(typeof out.note).toBe('string');
  });

  it('returns data unchanged (no note) when nothing is recognized as an event', () => {
    const envelope = esEnvelope([{ userEmail: 'only@a.projection' }]);
    expect(compactEventsResponse(envelope)).toBe(envelope);
    const weird = { rows: [1, 2, 3] };
    expect(compactEventsResponse(weird)).toBe(weird);
  });
});

// ---- handler wiring ----
describe('events handler compact/verbose mode', () => {
  it('events_query compacts by default and includes the note marker', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([fullEvent()]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('verbose: true');
    expect(res.content[0].text).not.toContain('ipInfo');
    expect(res.content[0].text).toContain('Kyiv, Kyiv City, UA');
  });

  it('events_query verbose:true returns the raw payload byte-for-byte', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    const raw = [fullEvent()];
    mockClient.events.query.mockResolvedValueOnce(raw);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', { verbose: true });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe(JSON.stringify(raw, null, 2));
  });

  it('events_query does not leak verbose into the SDK options', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([fullEvent()]);
    await eventsHandler.handleCall('saas_alerts_events_query', { customer_id: 'c1', verbose: true });
    const opts = mockClient.events.query.mock.calls[0][0];
    expect(opts).not.toHaveProperty('verbose');
    expect(opts).toEqual(expect.objectContaining({ customerId: 'c1' }));
  });

  it('events_query empty result is still flagged isError in compact mode', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no events/i);
  });

  it('events_query_advanced compacts hits but preserves envelope; verbose passes through', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    const envelope = esEnvelope([fullEvent()]);
    mockClient.events.queryAdvanced.mockResolvedValueOnce(envelope);
    const res = await eventsHandler.handleCall('saas_alerts_events_query_advanced', {
      query: { match_all: {} },
    });
    expect(mockClient.events.queryAdvanced).toHaveBeenCalledWith({ query: { match_all: {} } });
    expect(res.content[0].text).toContain('_scroll_id');
    expect(res.content[0].text).not.toContain('ipInfo');

    mockClient.events.queryAdvanced.mockResolvedValueOnce(esEnvelope([fullEvent()]));
    const verboseRes = await eventsHandler.handleCall('saas_alerts_events_query_advanced', {
      query: { match_all: {} },
      verbose: true,
    });
    expect(mockClient.events.queryAdvanced).toHaveBeenLastCalledWith({ query: { match_all: {} } });
    expect(verboseRes.content[0].text).toContain('ipInfo');
  });

  it('events_query_advanced passes _source-filtered projections through unchanged', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    const envelope = esEnvelope([{ userEmail: 'projected@a.b' }]);
    mockClient.events.queryAdvanced.mockResolvedValueOnce(envelope);
    const res = await eventsHandler.handleCall('saas_alerts_events_query_advanced', {
      query: { _source: ['userEmail'], match_all: {} },
    });
    expect(res.content[0].text).toBe(JSON.stringify(envelope, null, 2));
  });

  it('events_scroll compacts by default and keeps the scroll id', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.scroll.mockResolvedValueOnce(esEnvelope([fullEvent()]));
    const res = await eventsHandler.handleCall('saas_alerts_events_scroll', { scroll_id: 'S1' });
    expect(mockClient.events.scroll).toHaveBeenCalledWith('S1');
    expect(res.content[0].text).toContain('_scroll_id');
    expect(res.content[0].text).not.toContain('ipInfo');
  });

  it('the three hit-list tools declare verbose in their inputSchema; count tools do not', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    const tools = eventsHandler.getTools();
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));
    for (const name of [
      'saas_alerts_events_query',
      'saas_alerts_events_query_advanced',
      'saas_alerts_events_scroll',
    ]) {
      const props = byName[name].inputSchema?.properties as Record<string, { type?: string }>;
      expect(props.verbose?.type, `${name} missing verbose param`).toBe('boolean');
      expect(byName[name].description).toMatch(/verbose/i);
    }
    for (const name of ['saas_alerts_events_count', 'saas_alerts_events_count_advanced']) {
      const props = byName[name].inputSchema?.properties as Record<string, unknown>;
      expect(props).not.toHaveProperty('verbose');
    }
  });
});
