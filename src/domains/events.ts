import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, DomainHandlerExtra, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { ok, emptyGuard } from '../utils/results.js';
import { compactEventsResponse } from '../utils/compact.js';

const VERBOSE_PARAM = {
  type: 'boolean',
  description:
    'Return full raw event records (large). Default false: events are compacted to triage-relevant fields.',
} as const;

/**
 * Guard against empty results, then reduce per-event records to triage fields
 * unless the caller asked for the full raw payload with verbose: true.
 */
function eventListResult(data: unknown, verbose: unknown): CallToolResult {
  const guarded = emptyGuard(data, 'events');
  if (verbose === true || guarded.isError) return guarded;
  return ok(compactEventsResponse(data));
}

function getTools(): Tool[] {
  return [
    {
      name: 'saas_alerts_events_query',
      description:
        'Query security events from SaaS Alerts with optional filters. ' +
        'Returns a paginated list of events matching the specified criteria. ' +
        'Events are compacted to triage-relevant fields by default; pass verbose: true for full raw records. ' +
        'Compact responses are capped at ~40,000 characters — over-cap result sets are truncated to the ' +
        'first events that fit, so prefer a modest size with from/size pagination or a narrower date range.',
      annotations: {
        title: 'Query security events',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Filter by SaaS Alerts customer ID' },
          alert_status: {
            type: 'string',
            enum: ['critical', 'medium', 'low'],
            description: 'Filter by alert severity',
          },
          event_type: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by one or more event types',
          },
          user_email: { type: 'string', description: 'Filter by user email (UPN)' },
          start_date: { type: 'string', description: 'Start of range — ISO-8601 timestamp or epoch ms (inclusive)' },
          end_date: { type: 'string', description: 'End of range — ISO-8601 timestamp or epoch ms (inclusive)' },
          size: { type: 'number', description: 'Maximum results to return (default 50)' },
          from: { type: 'number', description: 'Offset for pagination' },
          time_sort: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction on event timestamp',
          },
          verbose: VERBOSE_PARAM,
        },
      },
    },
    {
      name: 'saas_alerts_events_count',
      description: 'Count security events matching the given filters without fetching full records.',
      annotations: {
        title: 'Count security events',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Filter by customer ID' },
          alert_status: {
            type: 'string',
            enum: ['critical', 'medium', 'low'],
            description: 'Filter by alert severity',
          },
          event_type: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by event types',
          },
          start_date: { type: 'string', description: 'Start of range — ISO-8601 timestamp or epoch ms (inclusive)' },
          end_date: { type: 'string', description: 'End of range — ISO-8601 timestamp or epoch ms (inclusive)' },
        },
      },
    },
    {
      name: 'saas_alerts_events_query_advanced',
      description:
        'Execute an advanced Elasticsearch query against the SaaS Alerts events index. ' +
        'Accepts a raw Elasticsearch query body for maximum flexibility. ' +
        'Event hits are compacted to triage-relevant fields by default; pass verbose: true for full raw records. ' +
        'Compact responses are capped at ~40,000 characters — over-cap hit lists are truncated to the ' +
        'first hits that fit (hits.total still reports the true match count), so prefer a modest size ' +
        'with from/size in the query body.',
      annotations: {
        title: 'Advanced Elasticsearch event query',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'object',
            description: 'Elasticsearch query body (e.g. { "query": { "term": { "alertStatus": "critical" } } })',
          },
          verbose: VERBOSE_PARAM,
        },
        required: ['query'],
      },
    },
    {
      name: 'saas_alerts_events_count_advanced',
      description:
        'Count events using a raw Elasticsearch query body without fetching full records.',
      annotations: {
        title: 'Advanced event count',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'object',
            description: 'Elasticsearch query body',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'saas_alerts_events_scroll',
      description:
        'Continue paginating through a previous event query result set using a scroll ID. ' +
        'Call after saas_alerts_events_query_advanced returns a scroll ID. ' +
        'Event hits are compacted to triage-relevant fields by default; pass verbose: true for full raw records. ' +
        'Compact responses are capped at ~40,000 characters — if a scroll page exceeds the cap it is ' +
        'truncated, and the trimmed events canNOT be recovered by continuing the scroll (the server ' +
        'cursor has already advanced past them); re-run the originating query with a smaller size instead.',
      annotations: {
        title: 'Scroll through event results',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          scroll_id: { type: 'string', description: 'Scroll ID returned by a previous query' },
          verbose: VERBOSE_PARAM,
        },
        required: ['scroll_id'],
      },
    },
    {
      name: 'saas_alerts_recommended_actions',
      description:
        'Get the list of recommended remediation actions for SaaS Alerts event types. ' +
        'Use this to map detected event types to actionable guidance.',
      annotations: {
        title: 'Get recommended actions',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

async function handleCall(
  name: string,
  args: Record<string, unknown>,
  _extra?: DomainHandlerExtra
): Promise<CallToolResult> {
  const client = getClient();

  switch (name) {
    case 'saas_alerts_events_query': {
      const opts: Record<string, unknown> = {};
      if (args.customer_id) opts.customerId = args.customer_id;
      if (args.alert_status) opts.alertStatus = args.alert_status;
      if (args.event_type) opts.eventType = args.event_type;
      if (args.user_email) opts.userEmail = args.user_email;
      if (args.start_date) opts.start = args.start_date;
      if (args.end_date) opts.end = args.end_date;
      if (args.size !== undefined) opts.size = args.size;
      if (args.from !== undefined) opts.from = args.from;
      if (args.time_sort) opts.timeSort = args.time_sort;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await client.events.query(opts as any);
      return eventListResult(data, args.verbose);
    }

    case 'saas_alerts_events_count': {
      const opts: Record<string, unknown> = {};
      if (args.customer_id) opts.customerId = args.customer_id;
      if (args.alert_status) opts.alertStatus = args.alert_status;
      if (args.event_type) opts.eventType = args.event_type;
      if (args.start_date) opts.start = args.start_date;
      if (args.end_date) opts.end = args.end_date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await client.events.count(opts as any);
      return ok(data);
    }

    case 'saas_alerts_events_query_advanced': {
      const data = await client.events.queryAdvanced({ query: args.query as Record<string, unknown> });
      return eventListResult(data, args.verbose);
    }

    case 'saas_alerts_events_count_advanced': {
      const data = await client.events.countAdvanced({ query: args.query as Record<string, unknown> });
      return ok(data);
    }

    case 'saas_alerts_events_scroll': {
      const data = await client.events.scroll(args.scroll_id as string);
      return eventListResult(data, args.verbose);
    }

    case 'saas_alerts_recommended_actions': {
      const data = await client.events.recommendedActions();
      return emptyGuard(data, 'recommended actions');
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}

export const eventsHandler: DomainHandler = { getTools, handleCall };
