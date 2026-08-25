# node-saas-alerts SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@wyre-technology/node-saas-alerts`, a typed `fetch`-based REST client for the Kaseya SaaS Alerts External Partner API, mirroring the structure of `node-inforcer`.

**Architecture:** Layered — `SaasAlertsClient` façade (lazy `HttpClient`) → resource classes (`events`, `customers`, `users`, `devices`, `billing`, `reports`, `partner`) → `HttpClient` transport (`fetch`, retries, redaction, typed errors) → `errors.ts`. Zero runtime dependencies, dual ESM+CJS via `tsup`, published to GitHub Packages via `semantic-release`.

**Tech Stack:** TypeScript 5.5, tsup 8, vitest 2, semantic-release 25, native `fetch`. Node ≥20.

## Global Constraints

These apply to **all three** SaaS Alerts plans (SDK / MCP server / integration). Copy values verbatim.

- **Package name:** `@wyre-technology/node-saas-alerts`. **Repo:** `wyre-technology/node-saas-alerts`. Local path: `/Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/node-saas-alerts`.
- **Vendor slug (fleet-wide):** `saas-alerts`. **Display name:** `SaaS Alerts`. **Category:** `security`.
- **API base URL (prod):** `https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1`
- **API auth header:** `api_key` (literal, lowercase). NOT `Authorization: Bearer`.
- **Canonical gateway/Conduit header (end-to-end):** `X-SaaS-Alerts-API-Key`. This single string MUST be identical in: the MCP server's gateway-mode reader, the gateway `vendor-config.ts` `headerMapping`, the Conduit `vendor-config.ts` `headerMapping`, and the plugin `.mcp.json`. Header mismatch is the #1 silent-failure cause.
- **Env var (standalone mode):** `SAAS_ALERTS_API_KEY`.
- **MCP tool prefix:** `saas_alerts_` (e.g. `saas_alerts_query_events`).
- **License:** Apache-2.0. **Author:** `WYRE Technology`. **Node engine:** `>=20`.
- **No ESLint config** — `npm run lint` is `tsc --noEmit`.
- **Reference template (read-only, copy from):** `node-inforcer` at `/Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/node-inforcer`.

---

## File Structure

```
node-saas-alerts/
├── .github/workflows/{ci.yml, release.yml}, .github/dependabot.yml
├── .gitignore .npmrc .releaserc.json
├── package.json tsconfig.json tsup.config.ts vitest.config.ts
├── README.md LICENSE CHANGELOG.md CODE_OF_CONDUCT.md CONTRIBUTING.md SECURITY.md
├── src/
│   ├── index.ts                # public barrel
│   ├── client.ts               # SaasAlertsClient façade
│   ├── http.ts                 # HttpClient transport
│   ├── errors.ts               # typed error hierarchy
│   ├── resources/
│   │   ├── events.ts customers.ts users.ts devices.ts billing.ts reports.ts partner.ts
│   └── types/
│       ├── index.ts common.ts events.ts customers.ts users.ts devices.ts billing.ts reports.ts partner.ts
└── tests/
    ├── setup.ts helpers.ts http.test.ts client.test.ts
    └── resources/{events,customers,users,devices,billing,reports,partner}.test.ts
```

---

### Task 1: Scaffold package + config (no logic yet)

**Files:**
- Create: `node-saas-alerts/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.npmrc`, `.releaserc.json`, `.gitignore`, `LICENSE` (Apache-2.0), `CHANGELOG.md` (empty stub), `README.md` (stub).

**Interfaces:**
- Produces: a buildable empty package. Consumed by every later task.

- [ ] **Step 1: Create the repo dir and copy boilerplate from `node-inforcer`**

```bash
cd /Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers
mkdir -p node-saas-alerts/src/resources node-saas-alerts/src/types node-saas-alerts/tests/resources node-saas-alerts/.github/workflows
cd node-saas-alerts
git init -q
# Copy verbatim-reusable config from the template:
cp ../node-inforcer/tsconfig.json ../node-inforcer/tsup.config.ts ../node-inforcer/vitest.config.ts ../node-inforcer/.npmrc ../node-inforcer/.releaserc.json ../node-inforcer/.gitignore ../node-inforcer/LICENSE ../node-inforcer/.github/dependabot.yml ./ 2>/dev/null || true
cp ../node-inforcer/.github/dependabot.yml .github/
```
`tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.npmrc`, `.releaserc.json`, `.gitignore`, `LICENSE`, `.github/dependabot.yml` are reused **verbatim** (no SaaS-Alerts-specific content). Confirm `vitest.config.ts` keeps the coverage thresholds (lines/branches/functions/statements: 80).

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@wyre-technology/node-saas-alerts",
  "version": "0.0.0-semantically-released",
  "description": "Node.js client library for the Kaseya SaaS Alerts External Partner API",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "scripts": {
    "build": "tsup",
    "prebuild": "npm run clean",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "prepare": "npm run build"
  },
  "keywords": ["saas-alerts", "kaseya", "api", "msp", "security", "alerts", "m365"],
  "author": "WYRE Technology",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "https://github.com/WYRE-AI/node-saas-alerts.git" },
  "bugs": { "url": "https://github.com/WYRE-AI/node-saas-alerts/issues" },
  "homepage": "https://github.com/WYRE-AI/node-saas-alerts#readme",
  "devDependencies": {
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/git": "^10.0.1",
    "@semantic-release/github": "^12.0.6",
    "@semantic-release/npm": "^13.1.4",
    "@types/node": "^25.9.3",
    "@vitest/coverage-v8": "^2.0.0",
    "semantic-release": "^25.0.5",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=20" },
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"]
}
```

- [ ] **Step 3: `npm install` and verify the toolchain runs**

Run: `npm install`
Expected: installs devDeps, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold node-saas-alerts package"
```

---

### Task 2: Typed error hierarchy

**Files:**
- Create: `src/errors.ts`
- Test: `tests/resources/` errors are exercised via `http.test.ts` (Task 3).

**Interfaces:**
- Produces: `SaasAlertsError`, `AuthenticationError`, `ForbiddenError`, `NotFoundError`, `RateLimitError`, `ServerError` — all extend `SaasAlertsError(message, statusCode?, response?, errorCode?)`.

- [ ] **Step 1: Write `src/errors.ts`** (mirrors `node-inforcer/src/errors.ts`, renamed)

```ts
/** Base error for all SaaS Alerts SDK failures. */
export class SaasAlertsError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown,
    public errorCode?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
  }
}
export class AuthenticationError extends SaasAlertsError {
  constructor(message: string, response?: unknown, errorCode?: string) { super(message, 401, response, errorCode); }
}
export class ForbiddenError extends SaasAlertsError {
  constructor(message: string, response?: unknown, errorCode?: string) { super(message, 403, response, errorCode); }
}
export class NotFoundError extends SaasAlertsError {
  constructor(message: string, response?: unknown, errorCode?: string) { super(message, 404, response, errorCode); }
}
export class RateLimitError extends SaasAlertsError {
  constructor(message: string, response?: unknown, errorCode?: string) { super(message, 429, response, errorCode); }
}
export class ServerError extends SaasAlertsError {
  constructor(message: string, statusCode = 500, response?: unknown, errorCode?: string) { super(message, statusCode, response, errorCode); }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/errors.ts && git commit -m "feat: typed error hierarchy"
```

---

### Task 3: HttpClient transport (TDD)

**Files:**
- Create: `src/http.ts`, `src/types/common.ts`
- Test: `tests/setup.ts`, `tests/helpers.ts`, `tests/http.test.ts`

**Interfaces:**
- Consumes: `src/errors.ts`.
- Produces:
  - `interface SaasAlertsClientConfig { apiKey: string; baseUrl?: string; timeout?: number; maxRetries?: number; fetchImpl?: typeof fetch }` (in `types/common.ts`).
  - `interface HttpClientConfig { baseUrl: string; apiKey: string; timeout: number; maxRetries: number; fetchImpl: typeof fetch }`
  - `interface RequestOptions { method?: string; params?: Record<string, unknown>; body?: unknown }`
  - `class HttpClient { constructor(c: HttpClientConfig); request<T>(path: string, options?: RequestOptions): Promise<T> }`
  - **Design note:** Unlike `node-inforcer`, SaaS Alerts' envelope shape is unconfirmed, so `request()` returns the **parsed JSON body as-is** (no `.data` unwrap, no `success:false` handling). It still sends the `api_key` header, builds query strings (repeated `key=v` for arrays), retries 5xx with backoff, times out via `AbortController`, redacts the api key in error text, and maps status→typed error.

- [ ] **Step 1: Write `tests/setup.ts` and `tests/helpers.ts`**

`tests/setup.ts`:
```ts
import { vi } from 'vitest';
globalThis.fetch = vi.fn();
```
`tests/helpers.ts`:
```ts
export function mockResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
): { ok: boolean; status: number; text: () => Promise<string> } {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok, status, text: async () => text };
}
export function makeClient(mockFetch: unknown) {
  // imported lazily in tests to avoid circular import at module load
  return mockFetch;
}
```

- [ ] **Step 2: Write the failing test `tests/http.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../src/http.js';
import { AuthenticationError, RateLimitError, NotFoundError, ServerError } from '../src/errors.js';
import { mockResponse } from './helpers.js';

const BASE = 'https://api.example.test/api/v1';
function client(mockFetch: ReturnType<typeof vi.fn>, maxRetries = 0) {
  return new HttpClient({ baseUrl: BASE, apiKey: 'secret-key', timeout: 5000, maxRetries, fetchImpl: mockFetch as unknown as typeof fetch });
}

describe('HttpClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { mockFetch = vi.fn(); });

  it('sends the api_key header and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([{ id: 1 }]));
    const res = await client(mockFetch).request('/reports/events');
    expect(res).toEqual([{ id: 1 }]);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/reports/events`,
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ api_key: 'secret-key' }) }));
  });

  it('builds query params (arrays repeated)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    await client(mockFetch).request('/reports/events', { params: { size: 10, eventType: ['a', 'b'], skip: undefined } });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('size=10');
    expect(url).toContain('eventType=a');
    expect(url).toContain('eventType=b');
    expect(url).not.toContain('skip');
  });

  it('serializes a POST body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ count: 3 }));
    await client(mockFetch).request('/reports/events/query', { method: 'POST', body: { q: 'x' } });
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ q: 'x' }) });
  });

  it('maps 401 to AuthenticationError and redacts the key', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('bad key secret-key', { status: 401 }));
    await expect(client(mockFetch).request('/x')).rejects.toBeInstanceOf(AuthenticationError);
    await expect(client(mockFetch).request('/x')).rejects.toThrow(/\[REDACTED\]/);
  });

  it('maps 404/429/500', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('', { status: 404 }));
    await expect(client(mockFetch).request('/x')).rejects.toBeInstanceOf(NotFoundError);
    mockFetch.mockResolvedValueOnce(mockResponse('', { status: 429 }));
    await expect(client(mockFetch).request('/x')).rejects.toBeInstanceOf(RateLimitError);
    mockFetch.mockResolvedValueOnce(mockResponse('', { status: 500 }));
    await expect(client(mockFetch, 0).request('/x')).rejects.toBeInstanceOf(ServerError);
  });

  it('retries a 5xx then succeeds', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('', { status: 503 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
    const res = await client(mockFetch, 1).request('/x');
    expect(res).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns undefined for an empty 200 body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('', { status: 200 }));
    expect(await client(mockFetch).request('/x')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run tests/http.test.ts`
Expected: FAIL — `Cannot find module '../src/http.js'`.

- [ ] **Step 4: Write `src/types/common.ts`**

```ts
export interface SaasAlertsClientConfig {
  /** SaaS Alerts API key (sent as the `api_key` header). Required. */
  apiKey: string;
  /** Override the API base URL. Defaults to the production cloud-function host. */
  baseUrl?: string;
  /** Request timeout in ms. Default 30000. */
  timeout?: number;
  /** Max retry attempts on 5xx/network errors. Default 3. */
  maxRetries?: number;
  /** Custom fetch implementation (for testing). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Production base URL for the SaaS Alerts External Partner API. */
export const DEFAULT_BASE_URL =
  'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1';
```

- [ ] **Step 5: Write `src/http.ts`** (adapted from `node-inforcer/src/http.ts`; envelope logic removed, header → `api_key`)

```ts
import {
  SaasAlertsError, AuthenticationError, ForbiddenError,
  NotFoundError, RateLimitError, ServerError,
} from './errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  maxRetries: number;
  fetchImpl: typeof fetch;
}

export interface RequestOptions {
  method?: string;
  params?: Record<string, unknown>;
  body?: unknown;
}

const QUOTA_PATTERN = /quota|rate.?limit|throttl/i;

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
    this.maxRetries = config.maxRetries;
    this.fetchImpl = config.fetchImpl;
  }

  private redact(text: string): string {
    if (!this.apiKey) return text;
    return text.split(this.apiKey).join('[REDACTED]');
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', params, body } = options;
    let endpoint = path.trim();
    if (!endpoint.startsWith('/')) endpoint = `/${endpoint}`;

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) { for (const v of value) sp.append(key, String(v)); }
        else sp.set(key, String(value));
      }
      const qs = sp.toString();
      if (qs) url += `?${qs}`;
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** (attempt - 1) + Math.random() * 1000, 300_000);
        await new Promise((r) => setTimeout(r, delay));
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const headers: Record<string, string> = {
        api_key: this.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method, headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        let e = err as Error;
        if (e.name === 'AbortError') e = new SaasAlertsError(`Request timeout after ${this.timeout}ms`);
        lastError = e;
        if (attempt < this.maxRetries) continue;
        throw e;
      }

      const rawText = await response.text().catch(() => '');
      let parsed: unknown;
      try { parsed = rawText ? JSON.parse(rawText) : undefined; } catch { parsed = rawText || undefined; }

      if (!response.ok) {
        if (response.status >= 500 && attempt < this.maxRetries) {
          lastError = this.buildError(response.status, rawText);
          continue;
        }
        throw this.buildError(response.status, rawText);
      }
      return parsed as T;
    }
    throw lastError ?? new SaasAlertsError('Request failed after retries');
  }

  private buildError(status: number, rawText: string): SaasAlertsError {
    const message = this.redact((rawText || `HTTP ${status}`).slice(0, 500)).trim();
    if (status === 401) return new AuthenticationError(message || 'Invalid SaaS Alerts API key.');
    if (status === 429 || QUOTA_PATTERN.test(rawText)) return new RateLimitError(message || 'Rate limit exceeded.');
    if (status === 403) return new ForbiddenError(message || 'Forbidden.');
    if (status === 404) return new NotFoundError(message || 'Not found.');
    if (status >= 500) return new ServerError(message || 'Server error', status);
    return new SaasAlertsError(message || `SaaS Alerts API request failed (HTTP ${status})`, status);
  }
}
```

- [ ] **Step 6: Run the test, confirm it passes**

Run: `npx vitest run tests/http.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add src/http.ts src/types/common.ts tests/setup.ts tests/helpers.ts tests/http.test.ts
git commit -m "feat: HttpClient transport with retries, redaction, typed errors"
```

---

### Task 4: Resource type definitions

**Files:**
- Create: `src/types/{events,customers,users,devices,billing,reports,partner}.ts`, `src/types/index.ts`

**Interfaces:**
- Produces: option/entity interfaces consumed by Tasks 5–6 and the MCP server plan. Because the SaaS Alerts response bodies are not strongly documented, entity types are intentionally loose (`Record<string, unknown>` aliases) while **option** types (request inputs) are precise.

- [ ] **Step 1: Write the type files**

`src/types/events.ts`:
```ts
export type AlertStatus = 'low' | 'medium' | 'critical';

export interface EventQueryOptions {
  customerId?: string;
  userEmail?: string;
  alertStatus?: AlertStatus;
  eventType?: string | string[];
  /** ISO timestamp or epoch ms, per the API. */
  start?: string;
  end?: string;
  /** Offset for paging. */
  from?: number;
  /** Page size. */
  size?: number;
  /** Sort direction on timestamp, e.g. 'asc' | 'desc'. */
  timeSort?: 'asc' | 'desc';
  /** When true, opens a scroll cursor; use scroll() to page. */
  scroll?: boolean;
}

export type SaasAlertsEvent = Record<string, unknown>;
export type RecommendedAction = Record<string, unknown>;
```
`src/types/customers.ts`:
```ts
export type Customer = Record<string, unknown>;
export type CustomerCreateInput = Record<string, unknown>;
export type CustomerUpdateInput = Record<string, unknown>;
export type WhitelistInput = Record<string, unknown>;
```
`src/types/users.ts`:
```ts
export type MspUser = Record<string, unknown>;
export type PartnerUser = Record<string, unknown>;
export type CustomerUser = Record<string, unknown>;
```
`src/types/devices.ts`:
```ts
export interface UnmappedDeviceOptions {
  organizationIds: string | string[];
  /** Minimum confidence score for suggestions. */
  confidence?: number;
  onlyWithSuggestions?: boolean;
}
export type Device = Record<string, unknown>;
export type DeviceOrganization = Record<string, unknown>;
```
`src/types/billing.ts`:
```ts
export type BillingDetails = Record<string, unknown>;
export type BillingDate = string;
```
`src/types/reports.ts`:
```ts
export type ScheduledReport = Record<string, unknown>;
export type ScheduledReportInput = Record<string, unknown>;
```
`src/types/partner.ts`:
```ts
export type PartnerProfile = Record<string, unknown>;
export type BrandingInput = Record<string, unknown>;
```
`src/types/index.ts`:
```ts
export * from './common.js';
export * from './events.js';
export * from './customers.js';
export * from './users.js';
export * from './devices.js';
export * from './billing.js';
export * from './reports.js';
export * from './partner.js';
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/types && git commit -m "feat: SaaS Alerts SDK type definitions"
```

---

### Task 5: `events` resource (exemplar — full TDD)

**Files:**
- Create: `src/resources/events.ts`
- Test: `tests/resources/events.test.ts`

**Interfaces:**
- Consumes: `HttpClient`, `EventQueryOptions`.
- Produces: `class EventsResource { constructor(getClient: () => Promise<HttpClient>); query(opts?: EventQueryOptions): Promise<SaasAlertsEvent[]>; count(opts?: EventQueryOptions): Promise<unknown>; queryAdvanced(body: Record<string, unknown>): Promise<unknown>; countAdvanced(body: Record<string, unknown>): Promise<unknown>; scroll(scrollId: string): Promise<unknown>; recommendedActions(): Promise<RecommendedAction[]> }`

- [ ] **Step 1: Write the failing test `tests/resources/events.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsResource } from '../../src/resources/events.js';
import { HttpClient } from '../../src/http.js';
import { mockResponse } from '../helpers.js';

const BASE = 'https://api.example.test/api/v1';
describe('EventsResource', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let events: EventsResource;
  beforeEach(() => {
    mockFetch = vi.fn();
    const client = new HttpClient({ baseUrl: BASE, apiKey: 'k', timeout: 5000, maxRetries: 0, fetchImpl: mockFetch as unknown as typeof fetch });
    events = new EventsResource(async () => client);
  });

  it('query passes filters as query params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([{ id: 'e1' }]));
    const res = await events.query({ customerId: 'c1', alertStatus: 'critical', size: 50, eventType: ['x', 'y'] });
    expect(res).toEqual([{ id: 'e1' }]);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/reports/events?');
    expect(url).toContain('customerId=c1');
    expect(url).toContain('alertStatus=critical');
    expect(url).toContain('size=50');
    expect(url).toContain('eventType=x');
    expect(url).toContain('eventType=y');
  });

  it('query coerces a non-array result to an array', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 'single' }));
    expect(await events.query()).toEqual([{ id: 'single' }]);
  });

  it('count hits /reports/events/count', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ count: 7 }));
    expect(await events.count({ customerId: 'c1' })).toEqual({ count: 7 });
    expect(mockFetch.mock.calls[0][0]).toContain('/reports/events/count?customerId=c1');
  });

  it('queryAdvanced POSTs the ES body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ hits: [] }));
    await events.queryAdvanced({ query: { match_all: {} } });
    expect(mockFetch.mock.calls[0][0]).toContain('/reports/events/query');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ query: { match_all: {} } }) });
  });

  it('scroll POSTs the scrollId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ hits: [] }));
    await events.scroll('SCROLL123');
    expect(mockFetch.mock.calls[0][0]).toContain('/reports/events/scroll');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ scrollId: 'SCROLL123' }) });
  });

  it('recommendedActions hits the alert-recommended-actions endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([{ action: 'reset' }]));
    expect(await events.recommendedActions()).toEqual([{ action: 'reset' }]);
    expect(mockFetch.mock.calls[0][0]).toContain('/reports/alert-recommended-actions');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — Run: `npx vitest run tests/resources/events.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `src/resources/events.ts`**

```ts
import type { HttpClient } from '../http.js';
import type { EventQueryOptions, SaasAlertsEvent, RecommendedAction } from '../types/events.js';

function toParams(opts: EventQueryOptions): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (opts.customerId !== undefined) p.customerId = opts.customerId;
  if (opts.userEmail !== undefined) p.userEmail = opts.userEmail;
  if (opts.alertStatus !== undefined) p.alertStatus = opts.alertStatus;
  if (opts.eventType !== undefined) p.eventType = opts.eventType;
  if (opts.start !== undefined) p.start = opts.start;
  if (opts.end !== undefined) p.end = opts.end;
  if (opts.from !== undefined) p.from = opts.from;
  if (opts.size !== undefined) p.size = opts.size;
  if (opts.timeSort !== undefined) p.timeSort = opts.timeSort;
  if (opts.scroll !== undefined) p.scroll = opts.scroll;
  return p;
}

export class EventsResource {
  constructor(private getClient: () => Promise<HttpClient>) {}

  /** `GET /reports/events` — query events/alerts with filters. */
  async query(opts: EventQueryOptions = {}): Promise<SaasAlertsEvent[]> {
    const client = await this.getClient();
    const data = await client.request<SaasAlertsEvent[] | SaasAlertsEvent>('/reports/events', { params: toParams(opts) });
    return Array.isArray(data) ? data : data ? [data] : [];
  }

  /** `GET /reports/events/count` — count matching events. */
  async count(opts: EventQueryOptions = {}): Promise<unknown> {
    const client = await this.getClient();
    return client.request('/reports/events/count', { params: toParams(opts) });
  }

  /** `POST /reports/events/query` — advanced Elasticsearch-style query. */
  async queryAdvanced(body: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient();
    return client.request('/reports/events/query', { method: 'POST', body });
  }

  /** `POST /reports/events/count/query` — count via advanced query. */
  async countAdvanced(body: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient();
    return client.request('/reports/events/count/query', { method: 'POST', body });
  }

  /** `POST /reports/events/scroll` — page a large result set via a scroll cursor. */
  async scroll(scrollId: string): Promise<unknown> {
    const client = await this.getClient();
    return client.request('/reports/events/scroll', { method: 'POST', body: { scrollId } });
  }

  /** `GET /reports/alert-recommended-actions` — recommended security actions. */
  async recommendedActions(): Promise<RecommendedAction[]> {
    const client = await this.getClient();
    const data = await client.request<RecommendedAction[] | RecommendedAction>('/reports/alert-recommended-actions');
    return Array.isArray(data) ? data : data ? [data] : [];
  }
}
```

- [ ] **Step 4: Run, confirm PASS** — Run: `npx vitest run tests/resources/events.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/resources/events.ts tests/resources/events.test.ts && git commit -m "feat: events resource"`

---

### Task 6: Remaining resources — `customers`, `users`, `devices`, `billing`, `reports`, `partner`

Each follows the **exact pattern of Task 5** (constructor takes `() => Promise<HttpClient>`; one async method per endpoint; list methods coerce to array). Implement each as its own commit with a matching `tests/resources/<name>.test.ts` asserting the URL/method/body. Below is the complete method signature + endpoint mapping for each (the **Produces** other plans consume). Write a test per method asserting the exact path/method/body (model them on Task 5's tests).

- [ ] **Step 1: `src/resources/customers.ts`** + `tests/resources/customers.test.ts`

```ts
import type { HttpClient } from '../http.js';
import type { Customer, CustomerCreateInput, CustomerUpdateInput, WhitelistInput } from '../types/customers.js';

export class CustomersResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /customers` */
  async list(): Promise<Customer[]> {
    const c = await this.getClient();
    const d = await c.request<Customer[] | Customer>('/customers');
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /customers/{id}` */
  async get(id: string): Promise<Customer> {
    return (await this.getClient()).request<Customer>(`/customers/${encodeURIComponent(id)}`);
  }
  /** `POST /customers` */
  async create(body: CustomerCreateInput): Promise<Customer> {
    return (await this.getClient()).request<Customer>('/customers', { method: 'POST', body });
  }
  /** `PATCH /customers/{id}` */
  async update(id: string, body: CustomerUpdateInput): Promise<Customer> {
    return (await this.getClient()).request<Customer>(`/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  }
  /** `DELETE /customers/{id}` */
  async delete(id: string): Promise<unknown> {
    return (await this.getClient()).request(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  /** `POST /customers/{id}/whitelists` */
  async setWhitelists(id: string, body: WhitelistInput): Promise<unknown> {
    return (await this.getClient()).request(`/customers/${encodeURIComponent(id)}/whitelists`, { method: 'POST', body });
  }
  /** `POST /customers/{id}/accounts/whitelists` */
  async setAccountWhitelists(id: string, body: WhitelistInput): Promise<unknown> {
    return (await this.getClient()).request(`/customers/${encodeURIComponent(id)}/accounts/whitelists`, { method: 'POST', body });
  }
}
```
Test asserts each path/method (e.g. `delete('c1')` → `DELETE .../customers/c1`; `setWhitelists('c1',{...})` → `POST .../customers/c1/whitelists` with the JSON body).

- [ ] **Step 2: `src/resources/users.ts`** + test

```ts
import type { HttpClient } from '../http.js';
import type { MspUser, PartnerUser, CustomerUser } from '../types/users.js';

export class UsersResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /reports/msp-user` */
  async getMspUser(): Promise<MspUser> {
    return (await this.getClient()).request<MspUser>('/reports/msp-user');
  }
  /** `GET /reports/partnerUsers` */
  async listPartnerUsers(): Promise<PartnerUser[]> {
    const d = await (await this.getClient()).request<PartnerUser[] | PartnerUser>('/reports/partnerUsers');
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /reports/users?customerId=...` */
  async listByCustomer(customerId: string): Promise<CustomerUser[]> {
    const d = await (await this.getClient()).request<CustomerUser[] | CustomerUser>('/reports/users', { params: { customerId } });
    return Array.isArray(d) ? d : d ? [d] : [];
  }
}
```

- [ ] **Step 3: `src/resources/devices.ts`** + test

```ts
import type { HttpClient } from '../http.js';
import type { UnmappedDeviceOptions, Device, DeviceOrganization } from '../types/devices.js';

export class DevicesResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /reports/unify-mapped-devices-by-account?organizationIds=...` */
  async listMapped(organizationIds: string | string[]): Promise<Device[]> {
    const d = await (await this.getClient()).request<Device[] | Device>('/reports/unify-mapped-devices-by-account', { params: { organizationIds } });
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /reports/unify-unmapped-devices-by-account` */
  async listUnmapped(opts: UnmappedDeviceOptions): Promise<Device[]> {
    const params: Record<string, unknown> = { organizationIds: opts.organizationIds };
    if (opts.confidence !== undefined) params.confidence = opts.confidence;
    if (opts.onlyWithSuggestions !== undefined) params.onlyWithSuggestions = opts.onlyWithSuggestions;
    const d = await (await this.getClient()).request<Device[] | Device>('/reports/unify-unmapped-devices-by-account', { params });
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /reports/unify-ignored-devices?organizationIds=...` */
  async listIgnored(organizationIds: string | string[]): Promise<Device[]> {
    const d = await (await this.getClient()).request<Device[] | Device>('/reports/unify-ignored-devices', { params: { organizationIds } });
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /reports/devices-organizations` */
  async listOrganizations(): Promise<DeviceOrganization[]> {
    const d = await (await this.getClient()).request<DeviceOrganization[] | DeviceOrganization>('/reports/devices-organizations');
    return Array.isArray(d) ? d : d ? [d] : [];
  }
}
```

- [ ] **Step 4: `src/resources/billing.ts`** + test

```ts
import type { HttpClient } from '../http.js';
import type { BillingDetails, BillingDate } from '../types/billing.js';

export class BillingResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /reports/billing-details?billingDate=yyyy-mm-dd` */
  async getDetails(billingDate: string): Promise<BillingDetails> {
    return (await this.getClient()).request<BillingDetails>('/reports/billing-details', { params: { billingDate } });
  }
  /** `GET /reports/billing-dates` */
  async listDates(): Promise<BillingDate[]> {
    const d = await (await this.getClient()).request<BillingDate[] | BillingDate>('/reports/billing-dates');
    return Array.isArray(d) ? d : d ? [d] : [];
  }
}
```

- [ ] **Step 5: `src/resources/reports.ts`** + test

```ts
import type { HttpClient } from '../http.js';
import type { ScheduledReport, ScheduledReportInput } from '../types/reports.js';

export class ReportsResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /reports/scheduled-report` */
  async listScheduled(): Promise<ScheduledReport[]> {
    const d = await (await this.getClient()).request<ScheduledReport[] | ScheduledReport>('/reports/scheduled-report');
    return Array.isArray(d) ? d : d ? [d] : [];
  }
  /** `GET /reports/scheduled-report/{id}` */
  async getScheduled(id: string): Promise<ScheduledReport> {
    return (await this.getClient()).request<ScheduledReport>(`/reports/scheduled-report/${encodeURIComponent(id)}`);
  }
  /** `POST /reports/scheduled-report` */
  async createScheduled(body: ScheduledReportInput): Promise<ScheduledReport> {
    return (await this.getClient()).request<ScheduledReport>('/reports/scheduled-report', { method: 'POST', body });
  }
  /** `DELETE /reports/scheduled-report/{id}` */
  async deleteScheduled(id: string): Promise<unknown> {
    return (await this.getClient()).request(`/reports/scheduled-report/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
```

- [ ] **Step 6: `src/resources/partner.ts`** + test

```ts
import type { HttpClient } from '../http.js';
import type { PartnerProfile, BrandingInput } from '../types/partner.js';

export class PartnerResource {
  constructor(private getClient: () => Promise<HttpClient>) {}
  /** `GET /reports/partners/profile` */
  async getProfile(): Promise<PartnerProfile> {
    return (await this.getClient()).request<PartnerProfile>('/reports/partners/profile');
  }
  /** `POST /reports/partners/branding` */
  async updateBranding(body: BrandingInput): Promise<unknown> {
    return (await this.getClient()).request('/reports/partners/branding', { method: 'POST', body });
  }
}
```

- [ ] **Step 7: Run all resource tests** — Run: `npx vitest run tests/resources` → all PASS.
- [ ] **Step 8: Commit** — one commit per resource is fine, or `git add src/resources tests/resources && git commit -m "feat: customers/users/devices/billing/reports/partner resources"`.

---

### Task 7: `SaasAlertsClient` façade + barrel (TDD)

**Files:**
- Create: `src/client.ts`, `src/index.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
- Consumes: all resources, `SaasAlertsClientConfig`, `DEFAULT_BASE_URL`.
- Produces: `class SaasAlertsClient { constructor(config: SaasAlertsClientConfig); readonly events; customers; users; devices; billing; reports; partner }` — the entry point the MCP server imports.

- [ ] **Step 1: Write failing test `tests/client.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SaasAlertsClient } from '../src/client.js';

describe('SaasAlertsClient', () => {
  it('throws without an apiKey', () => {
    // @ts-expect-error intentional
    expect(() => new SaasAlertsClient({})).toThrow(/apiKey/);
  });
  it('exposes all resource namespaces', () => {
    const c = new SaasAlertsClient({ apiKey: 'k' });
    for (const ns of ['events', 'customers', 'users', 'devices', 'billing', 'reports', 'partner'] as const) {
      expect(c[ns]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.** Run: `npx vitest run tests/client.test.ts` → FAIL.

- [ ] **Step 3: Write `src/client.ts`**

```ts
import type { SaasAlertsClientConfig } from './types/common.js';
import { DEFAULT_BASE_URL } from './types/common.js';
import { HttpClient } from './http.js';
import { EventsResource } from './resources/events.js';
import { CustomersResource } from './resources/customers.js';
import { UsersResource } from './resources/users.js';
import { DevicesResource } from './resources/devices.js';
import { BillingResource } from './resources/billing.js';
import { ReportsResource } from './resources/reports.js';
import { PartnerResource } from './resources/partner.js';

export class SaasAlertsClient {
  readonly events: EventsResource;
  readonly customers: CustomersResource;
  readonly users: UsersResource;
  readonly devices: DevicesResource;
  readonly billing: BillingResource;
  readonly reports: ReportsResource;
  readonly partner: PartnerResource;

  private httpClient: HttpClient | null = null;
  private readonly config: Required<SaasAlertsClientConfig>;

  constructor(config: SaasAlertsClientConfig) {
    if (!config || !config.apiKey) {
      throw new Error('SaasAlertsClient requires an `apiKey`.');
    }
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeout ?? 30_000,
      maxRetries: config.maxRetries ?? 3,
      fetchImpl: config.fetchImpl ?? globalThis.fetch,
    };
    const getClient = async () => this.getHttpClient();
    this.events = new EventsResource(getClient);
    this.customers = new CustomersResource(getClient);
    this.users = new UsersResource(getClient);
    this.devices = new DevicesResource(getClient);
    this.billing = new BillingResource(getClient);
    this.reports = new ReportsResource(getClient);
    this.partner = new PartnerResource(getClient);
  }

  private async getHttpClient(): Promise<HttpClient> {
    if (this.httpClient) return this.httpClient;
    this.httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      fetchImpl: this.config.fetchImpl,
    });
    return this.httpClient;
  }
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
export { SaasAlertsClient } from './client.js';
export { EventsResource } from './resources/events.js';
export { CustomersResource } from './resources/customers.js';
export { UsersResource } from './resources/users.js';
export { DevicesResource } from './resources/devices.js';
export { BillingResource } from './resources/billing.js';
export { ReportsResource } from './resources/reports.js';
export { PartnerResource } from './resources/partner.js';
export * from './types/index.js';
export * from './errors.js';
```

- [ ] **Step 5: Run, confirm PASS.** Run: `npx vitest run` → all suites PASS.

- [ ] **Step 6: Build to verify dual output.** Run: `npm run build` → produces `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`. Then `npm run lint` → PASS.

- [ ] **Step 7: Commit** — `git add src/client.ts src/index.ts tests/client.test.ts && git commit -m "feat: SaasAlertsClient facade and public barrel"`

---

### Task 8: OSS hygiene, README, CI workflows

**Files:**
- Create: `README.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Copy hygiene files from the template and CI workflows verbatim**

```bash
cp ../node-inforcer/CODE_OF_CONDUCT.md ../node-inforcer/CONTRIBUTING.md ../node-inforcer/SECURITY.md ./
cp ../node-inforcer/.github/workflows/ci.yml ../node-inforcer/.github/workflows/release.yml .github/workflows/
```
`ci.yml` and `release.yml` are reused **verbatim** — they are repo-agnostic (matrix lint/test/build; release publishes to GitHub Packages via the scope in `package.json` + an inline authed `.npmrc`). No substitutions needed.

- [ ] **Step 2: Write `README.md`** — sections: `# @wyre-technology/node-saas-alerts`, `## Installation` (incl. an "Installing from GitHub Packages" note: scope requires an authed `.npmrc` with `//npm.pkg.github.com/:_authToken=...`), `## Authentication` (the `api_key` header, key generated in the SaaS Alerts UI), `## Quick start` (instantiate `new SaasAlertsClient({ apiKey })`, `await client.events.query({ alertStatus: 'critical' })`), `## Error handling` (the typed error classes), `## License`, `## Contributing`.

- [ ] **Step 3: Final full verification** — Run: `npm run lint && npm test && npm run build` → all PASS.

- [ ] **Step 4: Commit + create the GitHub repo + push**

```bash
git add -A && git commit -m "docs: README, OSS hygiene, CI workflows"
gh repo create wyre-technology/node-saas-alerts --private --source=. --remote=origin --push
```
(Confirm visibility — match the fleet; `node-inforcer` is private. Use `--public` only if the fleet SDKs are public.)

---

## Self-Review

**Spec coverage:** every SaaS Alerts endpoint group in the design §4 maps to a resource (events/customers/users/devices/billing/reports/partner) — ✓. Files/email/key-reset deliberately excluded per spec — ✓.
**Placeholder scan:** entity types are intentionally `Record<string, unknown>` (documented design choice, not a TODO) because response bodies are undocumented; option/input types are precise — acceptable.
**Type consistency:** `SaasAlertsClient` resource property names (`events`/`customers`/…) match the resource class names and are the exact handles the MCP server plan's `getClient()` consumes. `HttpClient.request<T>` signature is stable across all resources.
