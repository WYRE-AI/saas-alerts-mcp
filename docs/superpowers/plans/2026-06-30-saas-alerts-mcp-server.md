# saas-alerts-mcp Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `saas-alerts-mcp`, an MCP server exposing the SaaS Alerts API (full CRUD, domain-organized) over stdio + HTTP, depending on `@wyre-technology/node-saas-alerts`.

**Architecture:** Mirrors `inforcer-mcp` exactly — low-level `Server` from `@modelcontextprotocol/sdk` with hand-wired `ListTools`/`CallTool` handlers, **raw JSON-Schema** input (no zod), a `DomainHandler { getTools(), handleCall() }` per domain, credentials read from `process.env` via `utils/client.ts` (gateway mode injects per-request headers), fail-open elicitation guards on write/destructive tools, and a destructive-warning CI lint.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` ^1.12, `@wyre-technology/node-saas-alerts`, tsup (2 entrypoints), vitest, semantic-release. Node ≥18.

## Global Constraints

(See the SDK plan's Global Constraints — all apply. Repeated key items below.)

- **Repo:** `wyre-technology/saas-alerts-mcp`. Local: `/Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/saas-alerts-mcp` (already `git init`'d; contains `docs/superpowers/`).
- **SDK dependency:** `@wyre-technology/node-saas-alerts@^1.0.0` (built by the SDK plan; must be published first).
- **Env var:** `SAAS_ALERTS_API_KEY`. **Gateway-mode header (read from request):** `X-SaaS-Alerts-API-Key` (Node lowercases → `req.headers['x-saas-alerts-api-key']`).
- **Tool prefix:** `saas_alerts_`. **Server name:** `saas-alerts-mcp`. **MCP registry name:** `io.github.WYRE-AI/saas-alerts-mcp`. **Image:** `ghcr.io/wyre-ai/saas-alerts-mcp`. **Deploy vendor-slug:** `saas-alerts`.
- **Reference template (read-only, copy from):** `inforcer-mcp` at `/Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/inforcer-mcp`.
- **Destructive-lint rule:** any tool whose name contains `delete|remove|disable|revoke|reset|offboard|archive` MUST have a description starting with `⚠ DESTRUCTIVE` (or `⚠ HIGH-IMPACT`) AND `annotations.destructiveHint: true`, or `scripts/lint-destructive-warnings.mjs` fails CI.

## Canonical tool list (consumed by the fleet-integration plan)

`R`=read-only, `W`=write/state-changing (elicitation guard), `D`=destructive (elicitation guard + ⚠ prefix + `destructiveHint: true`).

| Tool name | Kind | SDK call |
|---|---|---|
| `saas_alerts_navigate` | R | (discovery) |
| `saas_alerts_status` | R | `users.getMspUser()` connectivity check |
| `saas_alerts_events_query` | R | `events.query(opts)` |
| `saas_alerts_events_count` | R | `events.count(opts)` |
| `saas_alerts_events_query_advanced` | R | `events.queryAdvanced(body)` |
| `saas_alerts_events_count_advanced` | R | `events.countAdvanced(body)` |
| `saas_alerts_events_scroll` | R | `events.scroll(scrollId)` |
| `saas_alerts_recommended_actions` | R | `events.recommendedActions()` |
| `saas_alerts_customers_list` | R | `customers.list()` |
| `saas_alerts_customers_get` | R | `customers.get(id)` |
| `saas_alerts_customers_create` | W | `customers.create(body)` |
| `saas_alerts_customers_update` | W | `customers.update(id, body)` |
| `saas_alerts_customers_delete` | D | `customers.delete(id)` |
| `saas_alerts_customers_set_whitelists` | W | `customers.setWhitelists(id, body)` |
| `saas_alerts_customers_set_account_whitelists` | W | `customers.setAccountWhitelists(id, body)` |
| `saas_alerts_users_get_msp` | R | `users.getMspUser()` |
| `saas_alerts_users_list_partner` | R | `users.listPartnerUsers()` |
| `saas_alerts_users_list_by_customer` | R | `users.listByCustomer(customerId)` |
| `saas_alerts_devices_list_mapped` | R | `devices.listMapped(orgIds)` |
| `saas_alerts_devices_list_unmapped` | R | `devices.listUnmapped(opts)` |
| `saas_alerts_devices_list_ignored` | R | `devices.listIgnored(orgIds)` |
| `saas_alerts_devices_list_orgs` | R | `devices.listOrganizations()` |
| `saas_alerts_billing_get_details` | R | `billing.getDetails(date)` |
| `saas_alerts_billing_list_dates` | R | `billing.listDates()` |
| `saas_alerts_reports_list_scheduled` | R | `reports.listScheduled()` |
| `saas_alerts_reports_get_scheduled` | R | `reports.getScheduled(id)` |
| `saas_alerts_reports_create_scheduled` | W | `reports.createScheduled(body)` |
| `saas_alerts_reports_delete_scheduled` | D | `reports.deleteScheduled(id)` |
| `saas_alerts_partner_get_profile` | R | `partner.getProfile()` |
| `saas_alerts_partner_update_branding` | W | `partner.updateBranding(body)` |

**mcp-assert canary tool:** `saas_alerts_users_get_msp`. **Smoke-test canary (gateway):** `saas_alerts_users_get_msp` (no args).

---

## File Structure

```
saas-alerts-mcp/
├── .dockerignore .env.example .eslintrc.json .gitignore .npmrc .releaserc.json
├── package.json tsconfig.json tsup.config.ts vitest.config.ts
├── Dockerfile docker-compose.yml smithery.yaml server.json glama.json
├── CHANGELOG.md CLA.md CODE_OF_CONDUCT.md CONTRIBUTING.md LICENSE README.md
├── scripts/lint-destructive-warnings.mjs
├── .github/workflows/{release.yml, test.yml, mcp-assert.yml, add-to-project.yml, claude.yml}
├── .github/CODEOWNERS
└── src/
    ├── index.ts http.ts server.ts prompts.ts
    ├── domains/{index.ts, navigation.ts, events.ts, customers.ts, users.ts, devices.ts, billing.ts, reports.ts, partner.ts}
    ├── elicitation/forms.ts
    ├── utils/{client.ts, logger.ts, types.ts, results.ts}
    └── __tests__/{domains.test.ts, navigation.test.ts, annotations.test.ts, results.test.ts}
```

---

### Task 1: Scaffold + boilerplate config (copy-and-substitute from inforcer-mcp)

**Files:** Create all root config + hygiene files.

- [ ] **Step 1: Copy verbatim-or-substitute files**

```bash
cd /Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/saas-alerts-mcp
mkdir -p src/domains src/elicitation src/utils src/__tests__ scripts .github/workflows
T=../inforcer-mcp
# Verbatim (repo-agnostic):
cp $T/tsconfig.json $T/vitest.config.ts $T/.eslintrc.json $T/.dockerignore $T/.gitignore $T/.npmrc $T/CLA.md $T/CODE_OF_CONDUCT.md $T/CONTRIBUTING.md $T/LICENSE $T/glama.json ./
cp $T/scripts/lint-destructive-warnings.mjs scripts/
cp $T/.github/CODEOWNERS .github/ 2>/dev/null || true
cp $T/.github/workflows/claude.yml $T/.github/workflows/add-to-project.yml .github/workflows/
```
`tsconfig.json`, `vitest.config.ts`, `.eslintrc.json`, `.dockerignore`, `.gitignore`, `.npmrc`, `CLA.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `glama.json`, `scripts/lint-destructive-warnings.mjs`, `claude.yml`, `add-to-project.yml` are reused **verbatim**. (`glama.json` keeps `"maintainers": ["asachs01"]`.)

- [ ] **Step 2: Write `package.json`** (inforcer-mcp's with name/keywords/dep swapped)

```json
{
  "name": "saas-alerts-mcp",
  "version": "1.0.0",
  "description": "MCP server for the Kaseya SaaS Alerts SaaS security monitoring platform",
  "type": "module",
  "main": "./dist/index.js",
  "bin": { "saas-alerts-mcp": "./dist/index.js" },
  "scripts": {
    "build": "tsup",
    "prebuild": "npm run clean",
    "dev": "tsup --watch",
    "start": "node dist/index.js",
    "start:http": "MCP_TRANSPORT=http node dist/http.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "prepare": "npm run build"
  },
  "keywords": ["saas-alerts","kaseya","mcp","msp","security","alerts","m365","model-context-protocol"],
  "author": "WYRE Technology",
  "license": "Apache-2.0",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@wyre-technology/node-saas-alerts": "^1.0.0"
  },
  "devDependencies": {
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/git": "^10.0.1",
    "@semantic-release/github": "^12.0.6",
    "@semantic-release/npm": "^13.1.4",
    "@types/node": "^25.3.2",
    "semantic-release": "^25.0.3",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

- [ ] **Step 3: Write `tsup.config.ts`** (two entrypoints — verbatim from inforcer-mcp)

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', http: 'src/http.ts' },
  format: ['esm'], target: 'node22', outDir: 'dist',
  clean: true, dts: true, sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 4: Write `.releaserc.json`** (verbatim from inforcer-mcp — `npmPublish: false`)

```json
{
  "branches": ["main", { "name": "next", "prerelease": true }, { "name": "next-major", "prerelease": true }, { "name": "beta", "prerelease": true }, { "name": "alpha", "prerelease": true }],
  "plugins": ["@semantic-release/commit-analyzer","@semantic-release/release-notes-generator",["@semantic-release/changelog",{"changelogFile":"CHANGELOG.md"}],["@semantic-release/npm",{"npmPublish":false}],"@semantic-release/github"]
}
```

- [ ] **Step 5: Write `.env.example`**

```
SAAS_ALERTS_API_KEY=
```

- [ ] **Step 6: `npm install`** → Expected: installs (the `@wyre-technology/node-saas-alerts` resolve requires the SDK published OR an `.npmrc` authed to GitHub Packages; if developing locally before publish, `npm install ../node-saas-alerts` temporarily, but revert to the `^1.0.0` range before commit).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "chore: scaffold saas-alerts-mcp"`

---

### Task 2: `utils/` — logger, types, client (credential brain), results guard

**Files:** Create `src/utils/{logger.ts, types.ts, client.ts, results.ts}`

**Interfaces:**
- Produces:
  - `logger` (copy `inforcer-mcp/src/utils/logger.ts` verbatim).
  - `types.ts`: `type DomainName = 'events'|'customers'|'users'|'devices'|'billing'|'reports'|'partner'`; `type CallToolResult = { content: Array<{type:'text';text:string}>; isError?: boolean }`; `interface DomainHandler { getTools(): Tool[]; handleCall(toolName: string, args: Record<string,unknown>, extra?: unknown): Promise<CallToolResult> }`.
  - `client.ts`: `getCredentials(): { apiKey: string } | null`; `getClient(): SaasAlertsClient`; `resetClient(): void`.
  - `results.ts`: `ok(data: unknown): CallToolResult` and `emptyGuard(data, label): CallToolResult` (the empty-result hallucination guard the template lacks).

- [ ] **Step 1: Copy `logger.ts`** — `cp ../inforcer-mcp/src/utils/logger.ts src/utils/logger.ts` (verbatim).

- [ ] **Step 2: Write `src/utils/types.ts`**

```ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type DomainName = 'events' | 'customers' | 'users' | 'devices' | 'billing' | 'reports' | 'partner';

export type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface DomainHandler {
  getTools(): Tool[];
  handleCall(toolName: string, args: Record<string, unknown>, extra?: unknown): Promise<CallToolResult>;
}
```

- [ ] **Step 3: Write `src/utils/client.ts`**

```ts
import { SaasAlertsClient } from '@wyre-technology/node-saas-alerts';
import { logger } from './logger.js';

let _client: SaasAlertsClient | null = null;
let _credKey: string | null = null;

interface Credentials { apiKey: string; }

export function getCredentials(): Credentials | null {
  const apiKey = process.env.SAAS_ALERTS_API_KEY;
  if (!apiKey) {
    logger.warn('Missing credentials', { hasApiKey: false });
    return null;
  }
  return { apiKey };
}

export function getClient(): SaasAlertsClient {
  const creds = getCredentials();
  if (!creds) {
    throw new Error('No SaaS Alerts API credentials configured. Set SAAS_ALERTS_API_KEY.');
  }
  if (_client && _credKey === creds.apiKey) return _client;
  _client = new SaasAlertsClient({ apiKey: creds.apiKey });
  _credKey = creds.apiKey;
  logger.info('Created SaaS Alerts API client');
  return _client;
}

export function resetClient(): void {
  _client = null;
  _credKey = null;
}
```

- [ ] **Step 4: Write the failing test `src/__tests__/results.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ok, emptyGuard } from '../utils/results.js';

describe('results helpers', () => {
  it('ok wraps data as pretty JSON text', () => {
    const r = ok([{ id: 1 }]);
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('"id": 1');
  });
  it('emptyGuard flags an empty array with isError and a clear message', () => {
    const r = emptyGuard([], 'events');
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no events/i);
  });
  it('emptyGuard passes through non-empty data', () => {
    const r = emptyGuard([{ id: 1 }], 'events');
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('"id": 1');
  });
  it('emptyGuard flags null/undefined', () => {
    expect(emptyGuard(null, 'customer').isError).toBe(true);
  });
});
```

- [ ] **Step 5: Run → FAIL.** `npx vitest run src/__tests__/results.test.ts` → FAIL (module missing).

- [ ] **Step 6: Write `src/utils/results.ts`** (the empty-result guard from the `mcp-empty-result-hallucination` skill)

```ts
import type { CallToolResult } from './types.js';

/** Standard success result: pretty-printed JSON. */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Guard against the LLM hallucinating over an empty response. If the API
 * returned nothing meaningful, return `isError: true` with an explicit
 * "no results" message instead of a successful empty payload.
 */
export function emptyGuard(data: unknown, label: string): CallToolResult {
  const isEmpty =
    data === null ||
    data === undefined ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === 'object' && !Array.isArray(data) && Object.keys(data as object).length === 0);
  if (isEmpty) {
    return {
      content: [{ type: 'text', text: `No ${label} found. The SaaS Alerts API returned an empty result for this query — do not infer or fabricate any ${label}.` }],
      isError: true,
    };
  }
  return ok(data);
}
```

- [ ] **Step 7: Run → PASS.** `npx vitest run src/__tests__/results.test.ts` → PASS.

- [ ] **Step 8: Commit** — `git add src/utils src/__tests__/results.test.ts && git commit -m "feat: utils — client credential brain, results/empty-guard, types, logger"`

---

### Task 3: Transports — `index.ts` (stdio) + `http.ts` (HTTP + gateway header injection)

**Files:** Create `src/index.ts`, `src/http.ts`. (Depends on `server.ts` from Task 4 — write `server.ts` stub first, or order Task 4 before Task 3. **Recommended: do Task 4 before Task 3.** Listed here for grouping.)

**Interfaces:**
- Consumes: `createServer()` (Task 4), `getCredentials`/`resetClient` (Task 2).

- [ ] **Step 1: Write `src/index.ts`**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('SaaS Alerts MCP server started (stdio)');
```

- [ ] **Step 2: Write `src/http.ts`** (adapted from inforcer-mcp; gateway reads `x-saas-alerts-api-key` → `SAAS_ALERTS_API_KEY`)

```ts
import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { getCredentials, resetClient } from './utils/client.js';
import { logger } from './utils/logger.js';

function startHttpServer(): void {
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = process.env.MCP_HTTP_HOST || '0.0.0.0';
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      const creds = getCredentials();
      res.writeHead(creds ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: creds ? 'ok' : 'degraded', transport: 'http', credentials: { configured: !!creds }, timestamp: new Date().toISOString() }));
      return;
    }
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
      return;
    }
    if (isGatewayMode) {
      const apiKey = req.headers['x-saas-alerts-api-key'] as string;
      if (apiKey) {
        process.env.SAAS_ALERTS_API_KEY = apiKey;
        resetClient();
      }
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, host, () => { logger.info(`HTTP streaming server listening on ${host}:${port}`); });
}

const transport = process.env.MCP_TRANSPORT;
if (transport === 'http') startHttpServer();
else import('./index.js');
```

- [ ] **Step 3: Build check** — Run: `npm run build` (after Task 4 exists) → produces `dist/index.js` + `dist/http.js`.

- [ ] **Step 4: Commit** — `git add src/index.ts src/http.ts && git commit -m "feat: stdio + HTTP transports with gateway header injection"`

---

### Task 4: Server core + navigation domain + domain registry

**Files:** Create `src/server.ts`, `src/domains/index.ts`, `src/domains/navigation.ts`
**Test:** `src/__tests__/navigation.test.ts`

**Interfaces:**
- Consumes: `getDomainHandler` (registry), `getNavigationTools`/`DOMAINS`, `getCredentials`/`getClient`.
- Produces: `createServer(): Server`; `DOMAINS: DomainName[]`; `getDomainHandler(d: DomainName): Promise<DomainHandler>`.

- [ ] **Step 1: Write `src/domains/navigation.ts`**

```ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainName } from '../utils/types.js';

export const DOMAINS: DomainName[] = ['events', 'customers', 'users', 'devices', 'billing', 'reports', 'partner'];

export function getNavigationTools(): Tool[] {
  return [
    {
      name: 'saas_alerts_navigate',
      description: 'Discover SaaS Alerts tools by domain. Returns the tools available in a domain (events, customers, users, devices, billing, reports, partner). Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { domain: { type: 'string', enum: DOMAINS, description: 'Domain to list tools for.' } }, required: ['domain'] },
    },
    {
      name: 'saas_alerts_status',
      description: 'Check SaaS Alerts API connectivity and credentials. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: {} },
    },
  ];
}
```

- [ ] **Step 2: Write `src/domains/index.ts`** (lazy registry — pattern from inforcer-mcp)

```ts
import type { DomainHandler, DomainName } from '../utils/types.js';

const cache = new Map<DomainName, DomainHandler>();

export async function getDomainHandler(domain: DomainName): Promise<DomainHandler> {
  const cached = cache.get(domain);
  if (cached) return cached;
  let handler: DomainHandler;
  switch (domain) {
    case 'events': handler = (await import('./events.js')).eventsHandler; break;
    case 'customers': handler = (await import('./customers.js')).customersHandler; break;
    case 'users': handler = (await import('./users.js')).usersHandler; break;
    case 'devices': handler = (await import('./devices.js')).devicesHandler; break;
    case 'billing': handler = (await import('./billing.js')).billingHandler; break;
    case 'reports': handler = (await import('./reports.js')).reportsHandler; break;
    case 'partner': handler = (await import('./partner.js')).partnerHandler; break;
    default: throw new Error(`Unknown domain: ${domain}`);
  }
  cache.set(domain, handler);
  return handler;
}
```

- [ ] **Step 3: Write `src/server.ts`** (adapted from inforcer-mcp; `status` uses `users.getMspUser()`)

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getNavigationTools, DOMAINS } from './domains/navigation.js';
import { getDomainHandler } from './domains/index.js';
import { getCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';
import type { DomainName } from './utils/types.js';
import { registerPromptHandlers } from './prompts.js';

export function createServer(): Server {
  const server = new Server(
    { name: 'saas-alerts-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, logging: {}, prompts: {} } }
  );
  registerPromptHandlers(server);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = [...getNavigationTools()];
    for (const domain of DOMAINS) {
      const handler = await getDomainHandler(domain);
      allTools.push(...handler.getTools());
    }
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;

    if (name === 'saas_alerts_navigate') {
      const domain = (args?.domain as string) as DomainName;
      if (!DOMAINS.includes(domain)) {
        return { content: [{ type: 'text' as const, text: `Invalid domain: ${domain}. Valid: ${DOMAINS.join(', ')}` }], isError: true };
      }
      const handler = await getDomainHandler(domain);
      const tools = handler.getTools().map(t => `${t.name}: ${t.description}`);
      return { content: [{ type: 'text' as const, text: `Domain: ${domain}\n\nAvailable tools:\n${tools.join('\n')}` }] };
    }

    if (name === 'saas_alerts_status') {
      const creds = getCredentials();
      if (!creds) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ connected: false, domains: DOMAINS, status: 'No credentials configured. Set SAAS_ALERTS_API_KEY.' }, null, 2) }] };
      }
      try {
        const { getClient } = await import('./utils/client.js');
        const me = await getClient().users.getMspUser();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ connected: true, mspUser: me, domains: DOMAINS, status: 'Connected. All tools available.' }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ connected: false, domains: DOMAINS, status: `Connectivity check failed: ${(error as Error).message}` }, null, 2) }], isError: true };
      }
    }

    for (const domain of DOMAINS) {
      const handler = await getDomainHandler(domain);
      if (handler.getTools().some(t => t.name === name)) {
        try {
          const handlerExtra = { ...(extra as object), server };
          return await handler.handleCall(name, (args || {}) as Record<string, unknown>, handlerExtra);
        } catch (error) {
          logger.error('Tool call failed', { tool: name, error: (error as Error).message });
          return { content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }], isError: true };
        }
      }
    }
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}. Use saas_alerts_navigate to discover available tools.` }], isError: true };
  });

  return server;
}
```

- [ ] **Step 4: Write `src/__tests__/navigation.test.ts`** — assert `saas_alerts_navigate` with `{domain:'events'}` lists event tools, an invalid domain returns `isError`, and `saas_alerts_status` returns `connected:false` when `SAAS_ALERTS_API_KEY` is unset (mock `../utils/client.js` like inforcer-mcp's `domains.test.ts`). Run → after domains exist.

- [ ] **Step 5: Commit** — `git add src/server.ts src/domains/index.ts src/domains/navigation.ts src/__tests__/navigation.test.ts && git commit -m "feat: server core, navigation, domain registry"`

---

### Task 5: `events` domain (exemplar — full TDD)

**Files:** Create `src/domains/events.ts`; extend `src/__tests__/domains.test.ts`.

**Interfaces:**
- Consumes: `getClient()`, `ok`/`emptyGuard`.
- Produces: `export const eventsHandler: DomainHandler`.

- [ ] **Step 1: Write the failing test (add an `events` describe block to `src/__tests__/domains.test.ts`)** — model on inforcer-mcp's `domains.test.ts` (mock `../utils/client.js` to return a fake `SaasAlertsClient` of `vi.fn()`s):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = {
  events: {
    query: vi.fn(), count: vi.fn(), queryAdvanced: vi.fn(),
    countAdvanced: vi.fn(), scroll: vi.fn(), recommendedActions: vi.fn(),
  },
  users: { getMspUser: vi.fn() },
  // ...other domains added as their blocks are written
};
vi.mock('../utils/client.js', () => ({
  getClient: () => mockClient,
  getCredentials: () => ({ apiKey: 'k' }),
  resetClient: () => {},
}));
beforeEach(() => vi.clearAllMocks());

describe('events domain', () => {
  it('events_query maps snake args to SDK opts and returns data', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([{ id: 'e1' }]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', { customer_id: 'c1', alert_status: 'critical', size: 50, event_type: ['x'] });
    expect(mockClient.events.query).toHaveBeenCalledWith({ customerId: 'c1', alertStatus: 'critical', size: 50, eventType: ['x'] });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('e1');
  });
  it('events_query empty result is flagged isError', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no events/i);
  });
  it('events_scroll forwards scroll_id', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.scroll.mockResolvedValueOnce({ hits: [{ id: 'e2' }] });
    await eventsHandler.handleCall('saas_alerts_events_scroll', { scroll_id: 'S1' });
    expect(mockClient.events.scroll).toHaveBeenCalledWith('S1');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/__tests__/domains.test.ts` → FAIL.

- [ ] **Step 3: Write `src/domains/events.ts`**

```ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { ok, emptyGuard } from '../utils/results.js';
import { logger } from '../utils/logger.js';

const EVENT_FILTERS = {
  customer_id: { type: 'string', description: 'Filter by SaaS Alerts customer ID.' },
  user_email: { type: 'string', description: 'Filter by affected user email.' },
  alert_status: { type: 'string', enum: ['low', 'medium', 'critical'], description: 'Filter by alert severity.' },
  event_type: { type: 'array', items: { type: 'string' }, description: 'One or more event types to filter by.' },
  start: { type: 'string', description: 'Start of the time window (ISO timestamp or epoch ms).' },
  end: { type: 'string', description: 'End of the time window.' },
  from: { type: 'number', description: 'Result offset for paging.' },
  size: { type: 'number', description: 'Page size.' },
  time_sort: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction on timestamp.' },
} as const;

function toOpts(args: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  if (args.customer_id !== undefined) o.customerId = args.customer_id;
  if (args.user_email !== undefined) o.userEmail = args.user_email;
  if (args.alert_status !== undefined) o.alertStatus = args.alert_status;
  if (args.event_type !== undefined) o.eventType = args.event_type;
  if (args.start !== undefined) o.start = args.start;
  if (args.end !== undefined) o.end = args.end;
  if (args.from !== undefined) o.from = args.from;
  if (args.size !== undefined) o.size = args.size;
  if (args.time_sort !== undefined) o.timeSort = args.time_sort;
  return o;
}

function getTools(): Tool[] {
  return [
    { name: 'saas_alerts_events_query', description: 'Query SaaS Alerts security events/alerts with filters (customer, user, severity, type, time window). Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...EVENT_FILTERS } } },
    { name: 'saas_alerts_events_count', description: 'Count SaaS Alerts events matching the given filters. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...EVENT_FILTERS } } },
    { name: 'saas_alerts_events_query_advanced', description: 'Advanced event search using a raw Elasticsearch query body. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { query: { type: 'object', description: 'Elasticsearch query DSL body.' } }, required: ['query'] } },
    { name: 'saas_alerts_events_count_advanced', description: 'Count events using a raw Elasticsearch query body. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { query: { type: 'object', description: 'Elasticsearch query DSL body.' } }, required: ['query'] } },
    { name: 'saas_alerts_events_scroll', description: 'Page a large event result set using a scroll cursor returned by a prior query. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { scroll_id: { type: 'string', description: 'Scroll cursor ID.' } }, required: ['scroll_id'] } },
    { name: 'saas_alerts_recommended_actions', description: 'List recommended security actions for alerts. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: {} } },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const client = getClient();
  switch (toolName) {
    case 'saas_alerts_events_query': {
      logger.info('API call: events.query');
      return emptyGuard(await client.events.query(toOpts(args)), 'events');
    }
    case 'saas_alerts_events_count':
      logger.info('API call: events.count');
      return ok(await client.events.count(toOpts(args)));
    case 'saas_alerts_events_query_advanced':
      logger.info('API call: events.queryAdvanced');
      return ok(await client.events.queryAdvanced({ query: args.query as Record<string, unknown> }));
    case 'saas_alerts_events_count_advanced':
      logger.info('API call: events.countAdvanced');
      return ok(await client.events.countAdvanced({ query: args.query as Record<string, unknown> }));
    case 'saas_alerts_events_scroll':
      logger.info('API call: events.scroll');
      return ok(await client.events.scroll(args.scroll_id as string));
    case 'saas_alerts_recommended_actions':
      logger.info('API call: events.recommendedActions');
      return emptyGuard(await client.events.recommendedActions(), 'recommended actions');
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

export const eventsHandler: DomainHandler = { getTools, handleCall };
```

- [ ] **Step 4: Run → PASS.** `npx vitest run src/__tests__/domains.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/domains/events.ts src/__tests__/domains.test.ts && git commit -m "feat: events domain"`

---

### Task 6: Write/destructive domains — `customers`, `reports`, `partner` (with elicitation)

**Files:** Create `src/elicitation/forms.ts`, `src/domains/customers.ts`, `src/domains/reports.ts`, `src/domains/partner.ts`; extend `domains.test.ts`.

**Interfaces:**
- Produces: `confirmWrite(server, summary): Promise<boolean>` (fail-open); `customersHandler`, `reportsHandler`, `partnerHandler`.

- [ ] **Step 1: Write `src/elicitation/forms.ts`** (generalized fail-open confirm, from inforcer-mcp's `confirmAssessmentRun`)

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Ask the user to confirm a write/destructive SaaS Alerts operation.
 * Fail-open: if the client doesn't support elicitation (or it throws), returns
 * `true` so the op proceeds (the tool description/annotations already instruct
 * the caller to confirm). Returns `false` ONLY on explicit decline / confirm:false.
 */
export async function confirmWrite(server: Server, summary: string): Promise<boolean> {
  try {
    const result = await (server as any).elicitInput({
      message: `Confirm: ${summary}`,
      requestedSchema: {
        type: 'object',
        properties: { confirm: { type: 'boolean', title: 'Confirm', description: 'Set to true to proceed.' } },
        required: ['confirm'],
      },
    });
    if (result?.action === 'accept' && result.content) return result.content.confirm === true;
    if (result?.action === 'decline' || result?.action === 'cancel') return false;
  } catch { /* elicitation unsupported — proceed */ }
  return true;
}
```

- [ ] **Step 2: Write the failing tests** for: `customers_delete` cancelled when `confirm:false` (assert `customers.delete` NOT called, `isError:true`, text contains `cancelled`); `customers_delete` proceeds with no elicitation server; `customers_create` forwards body; `reports_delete_scheduled` cancelled; `partner_update_branding` forwards body. (Pattern = inforcer-mcp `domains.test.ts` elicitation tests, passing `{ server: { elicitInput } }` as 3rd arg.) Run → FAIL.

- [ ] **Step 3: Write `src/domains/customers.ts`**

```ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { ok, emptyGuard } from '../utils/results.js';
import { confirmWrite } from '../elicitation/forms.js';
import { logger } from '../utils/logger.js';

const ID = { customer_id: { type: 'string', description: 'SaaS Alerts customer ID.' } };

function getTools(): Tool[] {
  return [
    { name: 'saas_alerts_customers_list', description: 'List all SaaS Alerts customers. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true }, inputSchema: { type: 'object' as const, properties: {} } },
    { name: 'saas_alerts_customers_get', description: 'Get a single SaaS Alerts customer by ID. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true }, inputSchema: { type: 'object' as const, properties: { ...ID }, required: ['customer_id'] } },
    { name: 'saas_alerts_customers_create', description: 'Create a SaaS Alerts customer. Confirm with the user before invoking.',
      annotations: { title: 'Create customer', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { body: { type: 'object', description: 'Customer fields per the SaaS Alerts API.' } }, required: ['body'] } },
    { name: 'saas_alerts_customers_update', description: 'Update a SaaS Alerts customer. Confirm with the user before invoking.',
      annotations: { title: 'Update customer', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...ID, body: { type: 'object', description: 'Fields to update.' } }, required: ['customer_id', 'body'] } },
    { name: 'saas_alerts_customers_delete', description: '⚠ DESTRUCTIVE. Permanently delete a SaaS Alerts customer. Confirm with the user before invoking.',
      annotations: { title: 'Delete customer (destructive)', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...ID }, required: ['customer_id'] } },
    { name: 'saas_alerts_customers_set_whitelists', description: 'Set IP/country whitelists for a customer (changes security posture). Confirm with the user before invoking.',
      annotations: { title: 'Set customer whitelists', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...ID, body: { type: 'object', description: 'Whitelist payload (IPs/countries).' } }, required: ['customer_id', 'body'] } },
    { name: 'saas_alerts_customers_set_account_whitelists', description: 'Set account-level whitelists for a customer (changes security posture). Confirm with the user before invoking.',
      annotations: { title: 'Set account whitelists', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: { ...ID, body: { type: 'object', description: 'Account whitelist payload.' } }, required: ['customer_id', 'body'] } },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>, extra?: unknown): Promise<CallToolResult> {
  const client = getClient();
  const server = (extra as { server?: Server } | undefined)?.server;
  const id = args.customer_id as string;
  switch (toolName) {
    case 'saas_alerts_customers_list':
      logger.info('API call: customers.list');
      return emptyGuard(await client.customers.list(), 'customers');
    case 'saas_alerts_customers_get':
      logger.info('API call: customers.get', { id });
      return emptyGuard(await client.customers.get(id), 'customer');
    case 'saas_alerts_customers_create':
      if (server && !(await confirmWrite(server, `create a new SaaS Alerts customer`))) return cancelled();
      logger.info('API call: customers.create');
      return ok(await client.customers.create(args.body as Record<string, unknown>));
    case 'saas_alerts_customers_update':
      if (server && !(await confirmWrite(server, `update customer ${id}`))) return cancelled();
      logger.info('API call: customers.update', { id });
      return ok(await client.customers.update(id, args.body as Record<string, unknown>));
    case 'saas_alerts_customers_delete':
      if (server && !(await confirmWrite(server, `permanently DELETE customer ${id}`))) return cancelled();
      logger.info('API call: customers.delete', { id });
      return ok(await client.customers.delete(id));
    case 'saas_alerts_customers_set_whitelists':
      if (server && !(await confirmWrite(server, `change IP/country whitelists for customer ${id}`))) return cancelled();
      logger.info('API call: customers.setWhitelists', { id });
      return ok(await client.customers.setWhitelists(id, args.body as Record<string, unknown>));
    case 'saas_alerts_customers_set_account_whitelists':
      if (server && !(await confirmWrite(server, `change account whitelists for customer ${id}`))) return cancelled();
      logger.info('API call: customers.setAccountWhitelists', { id });
      return ok(await client.customers.setAccountWhitelists(id, args.body as Record<string, unknown>));
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

function cancelled(): CallToolResult {
  return { content: [{ type: 'text', text: 'Operation cancelled by user.' }], isError: true };
}

export const customersHandler: DomainHandler = { getTools, handleCall };
```

- [ ] **Step 4: Write `src/domains/reports.ts`** — same pattern. Tools: `saas_alerts_reports_list_scheduled` (R, emptyGuard 'scheduled reports'), `saas_alerts_reports_get_scheduled` (R, arg `report_id`, emptyGuard), `saas_alerts_reports_create_scheduled` (W, arg `body`, confirmWrite), `saas_alerts_reports_delete_scheduled` (D — description starts `⚠ DESTRUCTIVE`, `destructiveHint: true`, arg `report_id`, confirmWrite). Map to `reports.listScheduled/getScheduled/createScheduled/deleteScheduled`.

- [ ] **Step 5: Write `src/domains/partner.ts`** — Tools: `saas_alerts_partner_get_profile` (R, emptyGuard 'partner profile'), `saas_alerts_partner_update_branding` (W, arg `body`, confirmWrite, `readOnlyHint:false`). Map to `partner.getProfile/updateBranding`.

- [ ] **Step 6: Run → PASS.** `npx vitest run src/__tests__/domains.test.ts` → PASS.
- [ ] **Step 7: Commit** — `git add src/elicitation src/domains/customers.ts src/domains/reports.ts src/domains/partner.ts src/__tests__/domains.test.ts && git commit -m "feat: customers/reports/partner domains with elicitation guards"`

---

### Task 7: Read-only domains — `users`, `devices`, `billing`

**Files:** Create `src/domains/users.ts`, `src/domains/devices.ts`, `src/domains/billing.ts`; extend `domains.test.ts`.

- [ ] **Step 1: Tests** — for each tool assert the SDK method is called with mapped args and the result returned (empty list → `emptyGuard` `isError`). Run → FAIL.
- [ ] **Step 2: Write `src/domains/users.ts`** — Tools: `saas_alerts_users_get_msp` (no args → `users.getMspUser()`, `ok`), `saas_alerts_users_list_partner` (→ `users.listPartnerUsers()`, emptyGuard 'partner users'), `saas_alerts_users_list_by_customer` (arg `customer_id` → `users.listByCustomer(id)`, emptyGuard 'users'). All `readOnlyHint: true`.
- [ ] **Step 3: Write `src/domains/devices.ts`** — Tools: `saas_alerts_devices_list_mapped` (arg `organization_ids: string[]` → `devices.listMapped(ids)`), `saas_alerts_devices_list_unmapped` (args `organization_ids`, `confidence?`, `only_with_suggestions?` → `devices.listUnmapped({organizationIds, confidence, onlyWithSuggestions})`), `saas_alerts_devices_list_ignored` (arg `organization_ids` → `devices.listIgnored(ids)`), `saas_alerts_devices_list_orgs` (no args → `devices.listOrganizations()`). All read-only, emptyGuard.
- [ ] **Step 4: Write `src/domains/billing.ts`** — Tools: `saas_alerts_billing_get_details` (arg `billing_date: 'yyyy-mm-dd'` → `billing.getDetails(date)`, `ok`), `saas_alerts_billing_list_dates` (→ `billing.listDates()`, emptyGuard 'billing dates'). Read-only.
- [ ] **Step 5: Run → PASS.** `npx vitest run src/__tests__/domains.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git add src/domains/users.ts src/domains/devices.ts src/domains/billing.ts src/__tests__/domains.test.ts && git commit -m "feat: users/devices/billing read-only domains"`

---

### Task 8: Prompts + annotations test + destructive-lint

**Files:** Create `src/prompts.ts`, `src/__tests__/annotations.test.ts`.

**Interfaces:**
- Produces: `registerPromptHandlers(server: Server): void`.

- [ ] **Step 1: Write `src/prompts.ts`** — register `ListPrompts`/`GetPrompt` (pattern from inforcer-mcp). Three prompts:
  - `alert-triage` (no args): numbered steps — query critical events (`saas_alerts_events_query alert_status:critical`), rank by tenant impact, separate true positives from noise, cross-ref `saas_alerts_recommended_actions`, output a shift-ready response table. Note read context.
  - `customer-alert-summary` (arg `customer_id`, required): events for one customer over a window → severity breakdown → recommended actions.
  - `cross-tenant-anomaly` (arg `event_type`, optional): use advanced query to find a pattern across customers.
  Each returns `{ description, messages: [{ role:'user', content:{ type:'text', text: [...].join('\n') } }] }` with args interpolated `${args?.customer_id ?? '<customer_id>'}`.

- [ ] **Step 2: Write `src/__tests__/annotations.test.ts`** — iterate every tool from every domain handler + navigation and assert: (a) each has `annotations`; (b) any tool whose name matches `/delete|remove|disable|revoke|reset|offboard|archive/` has `annotations.destructiveHint === true` and a description starting with `⚠`. This mirrors the CI lint at the unit level.

```ts
import { describe, it, expect } from 'vitest';
import { DOMAINS, getNavigationTools } from '../domains/navigation.js';
import { getDomainHandler } from '../domains/index.js';

describe('tool annotations', () => {
  it('every tool has annotations; destructive tools are marked', async () => {
    const tools = [...getNavigationTools()];
    for (const d of DOMAINS) tools.push(...(await getDomainHandler(d)).getTools());
    for (const t of tools) {
      expect(t.annotations, `${t.name} missing annotations`).toBeDefined();
      if (/delete|remove|disable|revoke|reset|offboard|archive/.test(t.name)) {
        expect(t.annotations?.destructiveHint, `${t.name} must be destructiveHint`).toBe(true);
        expect(t.description.startsWith('⚠'), `${t.name} description must start with ⚠`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 3: Run the destructive lint + full tests + build**

Run: `node scripts/lint-destructive-warnings.mjs src` → Expected: PASS (no unmarked destructive tools).
Run: `npx vitest run` → all PASS.
Run: `npm run build` → produces `dist/index.js` + `dist/http.js`.
Run: `npm run lint` → PASS.

- [ ] **Step 4: Commit** — `git add src/prompts.ts src/__tests__/annotations.test.ts && git commit -m "feat: triage prompts + annotations test"`

---

### Task 9: Container + registry metadata + CI

**Files:** Create `Dockerfile`, `docker-compose.yml`, `smithery.yaml`, `server.json`, `.github/workflows/{release.yml, test.yml, mcp-assert.yml}`, `README.md`.

- [ ] **Step 1: Copy `Dockerfile` from inforcer-mcp and substitute** — replace `inforcer`→`saas-alerts`/`saasalerts` in the user/group names, all `LABEL` values, `io.github.WYRE-AI/saas-alerts-mcp`, and image URLs. Keep the multi-stage build, `--ignore-scripts`, `.npmrc` removal, `EXPOSE 8080`, healthcheck on `/health`, and the `ENV MCP_TRANSPORT=http / MCP_HTTP_PORT=8080 / MCP_HTTP_HOST=0.0.0.0 / AUTH_MODE=env` block, `CMD ["node", "dist/http.js"]`.

- [ ] **Step 2: Write `docker-compose.yml`** — copy inforcer-mcp's, replace `inforcer`→`saas-alerts`, and swap the env block to:
```yaml
      - SAAS_ALERTS_API_KEY=${SAAS_ALERTS_API_KEY}
      - MCP_SERVER_NAME=${MCP_SERVER_NAME:-saas-alerts-mcp}
      - MCP_TRANSPORT=http
      - MCP_HTTP_PORT=8080
```
(Drop the `INFORCER_REGION` line; the dev profile service likewise uses only `SAAS_ALERTS_API_KEY`.)

- [ ] **Step 3: Write `smithery.yaml`**

```yaml
startCommand:
  type: stdio
  configSchema:
    type: object
    required: [saasAlertsApiKey]
    properties:
      saasAlertsApiKey:
        type: string
        description: Your SaaS Alerts API key (generated in the SaaS Alerts UI)
  commandFunction: |-
    (config) => ({ command: 'node', args: ['dist/index.js'], env: { SAAS_ALERTS_API_KEY: config.saasAlertsApiKey, MCP_TRANSPORT: 'stdio' } })
```

- [ ] **Step 4: Write `server.json`** (from inforcer-mcp; env vars swapped)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.WYRE-AI/saas-alerts-mcp",
  "title": "SaaS Alerts",
  "description": "MCP server for Kaseya SaaS Alerts — SaaS security monitoring/alerting for M365 & Google Workspace.",
  "repository": { "url": "https://github.com/WYRE-AI/saas-alerts-mcp", "source": "github" },
  "version": "0.0.0",
  "websiteUrl": "https://github.com/WYRE-AI/saas-alerts-mcp",
  "packages": [
    {
      "registryType": "oci",
      "identifier": "ghcr.io/wyre-ai/saas-alerts-mcp:0.0.0",
      "transport": { "type": "stdio" },
      "environmentVariables": [
        { "name": "SAAS_ALERTS_API_KEY", "description": "SaaS Alerts API key (sent as the api_key header). Required.", "isRequired": true, "isSecret": true, "format": "string" },
        { "name": "MCP_TRANSPORT", "description": "Transport mode. 'stdio' for local CLI; image defaults to 'http' for gateway hosting.", "isRequired": false, "default": "stdio", "format": "string" },
        { "name": "AUTH_MODE", "description": "'env' reads vars locally; 'gateway' expects header injection from the WYRE MCP Gateway.", "isRequired": false, "default": "env", "format": "string" },
        { "name": "LOG_LEVEL", "description": "Log verbosity: debug, info, warn, error", "isRequired": false, "default": "info", "format": "string" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Write CI workflows** (thin callers to `wyre-technology/.github`, pinned SHAs copied verbatim from inforcer-mcp; substitute names)

`release.yml`: identical to inforcer-mcp's with `server-name: saas-alerts-mcp`, `image-name: ghcr.io/wyre-ai/saas-alerts-mcp`, and the `deploy` job `vendor-slug: saas-alerts`, `image-name: ghcr.io/wyre-ai/saas-alerts-mcp`.
`mcp-assert.yml`: copy inforcer-mcp's with `entry: dist/index.js` and `canary-tool: saas_alerts_users_get_msp`.
`test.yml`: copy inforcer-mcp's verbatim (it runs lint → `node scripts/lint-destructive-warnings.mjs src` → build → test on Node 18/20/22 + coverage). No substitution beyond any hardcoded name in comments.

- [ ] **Step 6: Write `README.md`** — sections: overview, the tool domains table, auth (`SAAS_ALERTS_API_KEY`, key generation in the SaaS Alerts UI), local run (`npm start` stdio / `npm run start:http`), Docker, gateway `AUTH_MODE=gateway` + `X-SaaS-Alerts-API-Key` note, and the destructive-tool confirmation behavior. Also create `CHANGELOG.md` stub.

- [ ] **Step 7: Final full gate**

Run: `npm run lint && node scripts/lint-destructive-warnings.mjs src && npx vitest run && npm run build` → all PASS.

- [ ] **Step 8: Local smoke test (stdio)**

```bash
SAAS_ALERTS_API_KEY=<real-key> node dist/index.js   # then send a tools/list via an MCP client, or:
SAAS_ALERTS_API_KEY=<real-key> npx @modelcontextprotocol/inspector node dist/index.js
```
Expected: `tools/list` returns all 30 tools; `saas_alerts_status` returns `connected:true`. (If no real key is available, confirm `saas_alerts_status` returns `connected:false` cleanly.)

- [ ] **Step 9: Commit + create repo + push**

```bash
git add -A && git commit -m "feat: container, registry metadata, CI, README"
gh repo create wyre-technology/saas-alerts-mcp --private --source=. --remote=origin --push
```
This triggers `release.yml` → semantic-release publishes `ghcr.io/wyre-ai/saas-alerts-mcp` and the MCP Registry entry. **Record the published image digest** (`docker buildx imagetools inspect ghcr.io/wyre-ai/saas-alerts-mcp:latest`) — the fleet-integration plan needs it for the Conduit bicepparam.

---

## Self-Review

**Spec coverage:** all 28 functional tools from design §5.1 + 2 navigation tools present and tabulated; files/email/key-reset excluded ✓; elicitation guards on every W/D tool ✓; empty-result guard added (new vs template) ✓; dual transport + gateway header injection ✓; destructive-lint gate satisfied (delete tools carry ⚠ + destructiveHint) ✓.
**Placeholder scan:** Tasks 6/7/8 specify remaining domains by exact tool name + SDK method + arg mapping + result helper rather than repeating full code; the events domain (Task 5) is the complete exemplar of the identical pattern, and `customers.ts` (Task 6) is shown in full as the write/destructive exemplar — engineers have a complete reference for both shapes. No "TODO"/"TBD".
**Type consistency:** tool names match the canonical table and the fleet-integration plan's `tool-classification`/`result-cache`/canary references; SDK method names (`events.query`, `customers.delete`, `users.getMspUser`, …) match the SDK plan's **Produces**; `DomainHandler`/`CallToolResult` identical to `utils/types.ts`; gateway header `x-saas-alerts-api-key` ↔ canonical `X-SaaS-Alerts-API-Key`.

---

## SECURITY CORRECTION (post-implementation, 2026-06-30)

**Tasks 2 & 3 originally specified the fleet template's gateway-auth pattern: writing each
request's API key to `process.env.SAAS_ALERTS_API_KEY` and caching a module-level singleton
client (`_client`/`_credKey`), with `resetClient()` on each request. An automated security
review (CONFIRMED by an adversarial re-review) found this is a CROSS-TENANT CREDENTIAL LEAK:**
the gateway/Conduit drive one container with many tenants' keys concurrently, and the
`await server.connect` / `await handleRequest` yield points let request B overwrite the global
key before request A's tool handler reads it — so A can execute with B's credentials.

**Corrected pattern (shipped): request-scoped credentials via `AsyncLocalStorage`.**
- `src/utils/client.ts`: a module-level `AsyncLocalStorage<Credentials>` (`credStore`), `runWithCredentials(creds, fn)`, `getCredentials()` reads `credStore.getStore()` then falls back to `process.env` (stdio mode), and `getClient()` returns `new SaasAlertsClient({apiKey})` per call. No `process.env` mutation, no singleton, `resetClient()` removed.
- `src/http.ts`: the `/mcp` handler runs the whole per-request lifecycle inside `runWithCredentials({apiKey}, handle)`. The stateless transport (`sessionIdGenerator: undefined` + `enableJsonResponse: true`) keeps the tool call inside that ALS context — guarded by a SECURITY-CRITICAL comment.

**Going forward:** future MCP servers should use the AsyncLocalStorage request-scoping
pattern above as the template. The older "write per-request credentials to `process.env`
+ module-level singleton client" gateway-auth approach is unsafe under concurrent
multi-tenant requests and should not be copied.
