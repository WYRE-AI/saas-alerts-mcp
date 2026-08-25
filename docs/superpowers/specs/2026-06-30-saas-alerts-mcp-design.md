# SaaS Alerts MCP — Design Spec

**Date:** 2026-06-30
**Author:** Claude (with Aaron Sachs)
**Status:** Approved (brainstorm) — pending spec review

## 1. Purpose

Add Kaseya **SaaS Alerts** to the WYRE MCP fleet so MSP security/alerting data
(M365 & Google Workspace event monitoring) is reachable by agents through both
the production **gateway** (`mcp.wyretechnology.com`) and **Conduit**.

SaaS Alerts is a SaaS security monitoring platform; it sits alongside the
existing security-vendor neighbors in the gateway (Huntress, RocketCyber,
SentinelOne, Blumira).

## 2. Vendor API summary

| | |
|---|---|
| Base URL (prod) | `https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1` |
| Auth | API key in the `api_key` HTTP header (generated in the SaaS Alerts UI, shown once) |
| Docs | https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.20.0 |
| Spec version | External Partner API 0.20.0 |

Notable surface: events/alerts (query, count, scroll, advanced Elasticsearch
query), customers (CRUD + IP/country whitelists), users (MSP/partner/by-customer),
Unify device mapping, billing, scheduled reports, partner profile/branding,
recommended actions.

## 3. Deliverables

The standard fleet treatment, plus dual registration (gateway + Conduit):

1. **`node-saas-alerts`** — typed REST SDK, published as `@wyre-technology/node-saas-alerts`.
2. **`saas-alerts-mcp`** — MCP server depending on the SDK.
3. **Gateway** registration (`mcp-gateway` `vendor-config.ts` + docker-compose + tests + marketplace).
4. **Conduit** registration (`vendor-config.ts` + docker-compose + `seed-vendor-registry.ts` + `vendor-fleet.bicep`/bicepparam + tests).
5. **`msp-claude-plugins`**: a `saas-alerts` plugin + `saas-alerts-triage` skill + `saas-alerts-analyst` agent (with marketplace data-regen).

All gateway/Conduit/marketplace changes land via **branch + PR**. No pushes to
`main`/prod, no deploys — Aaron merges and deploys.

## 4. `node-saas-alerts` SDK

Thin typed client mirroring the existing `node-*` packages.

- Base URL configurable (prod default; dev/QA hosts documented).
- Auth: `api_key` header. Constructor accepts `{ apiKey, baseUrl?, timeout? }`.
- Typed methods per endpoint group (see tool table below).
- Pagination/scroll helper for `/reports/events/scroll`.
- Error normalization: surface `{ status, message, body }`; distinguish 401/403
  (bad credentials) from other failures so the gateway `validate()` and the MCP
  layer can report clearly.
- Never return a bare empty success that an LLM could hallucinate over — follow
  the `mcp-empty-result-hallucination` rule at the MCP layer (explicit "no
  results" messaging).

## 5. `saas-alerts-mcp` server

Templated off the freshest fleet server (`inforcer-mcp`, Jun 2026):

- TypeScript, `tsup` build, `vitest`, `semantic-release`, `Dockerfile`,
  `docker-compose.yml`, `smithery.yaml`, `server.json`, `glama.json`,
  fleet-standard `.github/` CI (reusable `mcp-server-ci.yml`).
- Transports: **stdio** (default) and **HTTP** (`/mcp`, Streamable HTTP) via `http.ts`.
- `AUTH_MODE=gateway`: read the per-request `X-SaaSAlerts-API-Key` header instead
  of env; pass it to the SDK as the `api_key`. Env-var mode (`SAAS_ALERTS_API_KEY`)
  for standalone/local use.
- `src/domains/` — one module per domain, each registering its tools.
- `src/elicitation/` — confirmation guards for destructive/state-changing tools.
- `src/prompts.ts` — triage-oriented MCP prompts.

### 5.1 Tool surface (full CRUD, domain-organized)

✋ = destructive / state-changing → elicitation confirmation guard.

| Domain | Tools |
|---|---|
| **events** | `query_events`, `count_events`, `query_events_advanced` (ES syntax), `count_events_advanced`, `scroll_events`, `list_recommended_actions` |
| **customers** | `list_customers`, `get_customer`, `create_customer`✋, `update_customer`✋, `delete_customer`✋, `set_customer_whitelists`✋, `set_account_whitelists`✋ |
| **users** | `get_msp_user`, `list_partner_users`, `list_users_by_customer` |
| **devices** (Unify) | `list_mapped_devices`, `list_unmapped_devices`, `list_ignored_devices`, `list_device_orgs` |
| **billing** | `get_billing_details`, `list_billing_dates` |
| **reports** | `list_scheduled_reports`, `get_scheduled_report`, `create_scheduled_report`✋, `delete_scheduled_report`✋ |
| **partner** | `get_partner_profile`, `update_branding`✋ |

**Explicitly out of scope** (low value / high footgun for an agent surface):
`POST /files`, `GET/DELETE /files/{file}`, `POST /reports/send-email`,
and API-key reset (`POST /tools/apiKey`).

### 5.2 Event query parameters

`query_events` exposes the documented filters: `customerId`, `userEmail`,
`alertStatus` (low/medium/critical), `eventType` (the ~26-value taxonomy),
`start`, `end`, `from`, `size`, `timeSort`, `scroll`. Advanced variants accept a
raw Elasticsearch query body.

## 6. Gateway + Conduit wiring

Identical `VendorConfig` entry in both `vendor-config.ts` files:

```ts
'saas-alerts': {
  name: 'SaaS Alerts',
  slug: 'saas-alerts',
  category: 'security',
  containerUrl: 'http://saas-alerts-mcp:8080',
  fields: [{ key: 'apiKey', label: 'API Key', required: true, secret: true }],
  headerMapping: { apiKey: 'X-SaaSAlerts-API-Key' },
  docsUrl: 'https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.20.0',
  async validate(creds) { /* GET /reports/partners/profile; 401 -> invalid */ },
}
```

Plus, per repo:
- `docker-compose.yml` service (`image: ghcr.io/wyre-ai/saas-alerts-mcp:latest`, `AUTH_MODE=gateway`) and gateway `VENDOR_URL_SAAS_ALERTS` env.
- `vendor-config.test.ts` — bump the hardcoded vendor count.
- **Conduit only:** `scripts/seed-vendor-registry.ts` entry, `azure/vendor-fleet.bicep` + `vendor-fleet.conduit-prod.bicepparam` container definition, and any `canonical-map.json` entry if required by the completeness check.

The two layers of auth are kept distinct: gateway/Conduit inject
`X-SaaSAlerts-API-Key` → the MCP server (gateway mode) → SDK → real `api_key`
header to SaaS Alerts.

## 7. Plugin / skill / agent (`msp-claude-plugins`)

Follow the `msp-plugin-development` checklist (plugin.json header, marketplace
registration, data-regen, `.mcp.json`).

- **Plugin** `saas-alerts` — connects the MCP via the gateway; standard plugin.json + marketplace entry.
- **Skill** `saas-alerts-triage` — how to triage SaaS Alerts events: `alertStatus`
  tiers, the `eventType` taxonomy, advanced ES query patterns, cross-customer
  correlation, mapping events to recommended actions.
- **Agent** `saas-alerts-analyst` — investigates an alert/event window for a
  customer, correlates across customers, surfaces recommended actions, and drafts
  a triage summary.

## 8. Build order

1. `node-saas-alerts` SDK (types + client + tests).
2. `saas-alerts-mcp` server (domains, elicitation, transports, tests) against the SDK.
3. Local smoke test (stdio + HTTP).
4. Gateway wiring (branch + PR).
5. Conduit wiring (branch + PR).
6. `msp-claude-plugins` plugin + skill + agent (branch + PR, data-regen).

Independent pieces (SDK vs. plugin docs/skill text) parallelized via subagents.

## 9. Rejected alternatives

- **Single `saas_alerts_router` mega-tool** (à la `autotask-mcp`): rejected.
  SaaS Alerts' ~25 endpoints fit cleanly into discrete domain tools like
  `huntress-mcp`/`inforcer-mcp`, which is simpler for agents to use and matches
  the security-vendor neighbors.
- **`kaseya-saas-alerts` naming**: rejected in favor of `saas-alerts` (product
  brand, matching the `datto-*` precedent rather than the `kaseya-bms/vsa` one).
- **Read-only surface**: rejected — Aaron chose full CRUD (with elicitation
  guards on destructive tools).

## 10. Risks / open items

- **Container image must exist before Conduit/gateway prod can resolve it.** The
  registry-publish gating (`mcp-registry-publish-gating`) and fleet CI template
  apply; the PRs to gateway/Conduit should not be merged until
  `ghcr.io/wyre-ai/saas-alerts-mcp` is published.
- **`validate()` endpoint choice** assumes `GET /reports/partners/profile` is a
  cheap authenticated call. Confirm during implementation; fall back to
  `GET /reports/msp-user`.
- **Conduit vendor-count / completeness check** may require touching
  `canonical-map.json` and the completeness-check script — confirm against the
  current Conduit `main` when the wiring PR is cut.
