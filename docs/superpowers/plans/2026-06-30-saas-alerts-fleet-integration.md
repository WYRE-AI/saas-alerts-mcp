# SaaS Alerts Fleet Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `saas-alerts` vendor into (A) the production MCP gateway, (B) Conduit, and (C) ship a `saas-alerts` plugin + `saas-alerts-triage` skill + `saas-alerts-analyst` agent in `msp-claude-plugins`.

**Architecture:** Three independent deliverables, each a branch + PR (no pushes to main/prod, no deploys). A/B register the same `VendorConfig` (API-key auth, container `saas-alerts-mcp`). C connects to the hosted gateway via `.mcp.json`. All three share one canonical header string.

**Tech Stack:** TypeScript (gateway/Conduit configs), Bicep (Conduit prod), Astro/tsx (plugin docs site).

## Global Constraints

(See the SDK plan's Global Constraints.) Integration-critical values:

- **Vendor slug:** `saas-alerts`. **Display:** `SaaS Alerts`. **Category:** `security`. **Container:** `http://saas-alerts-mcp` (no port — fleet convention; `VENDOR_URL_SAAS_ALERTS` override adds `:8080` in compose). **Image:** `ghcr.io/wyre-ai/saas-alerts-mcp`.
- **Canonical header (end-to-end, MUST be byte-identical everywhere):** `X-SaaS-Alerts-API-Key`.
- **`validate()` (gateway & Conduit, identical):** GET `https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1/reports/partners/profile` with header `api_key: <key>` (NOT Bearer). 401/403 → invalid.
- **docsUrl:** `https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.20.0`
- **Prerequisite for prod steps:** `saas-alerts-mcp` image published (from the MCP-server plan). Steps blocked on the image digest are explicitly flagged.
- **Tool names** for classification/caching/canary come from the MCP-server plan's canonical tool table.

---

# Deliverable A — Gateway (`mcp-gateway`)

Repo: `/Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/mcp-gateway`.

### Task A1: Add the `saas-alerts` VendorConfig

**Files:** Modify `src/credentials/vendor-config.ts` (add to `VENDORS`, near the other `security` vendors, e.g. after `blumira`).

- [ ] **Step 1: Create a branch**

```bash
cd /Users/asachs/work/wyre/engineering/projects/mcp/mcp-servers/mcp-gateway
git checkout -b feat/saas-alerts-vendor
```

- [ ] **Step 2: Add the entry to `VENDORS`** (modeled on `rocketcyber`; validate corrected to the real host + `api_key` header)

```typescript
  'saas-alerts': {
    name: 'SaaS Alerts',
    slug: 'saas-alerts',
    category: 'security',
    containerUrl: 'http://saas-alerts-mcp',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true, secret: true },
    ],
    headerMapping: {
      apiKey: 'X-SaaS-Alerts-API-Key',
    },
    docsUrl: 'https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.20.0',
    async validate(creds) {
      const res = await fetch(
        'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1/reports/partners/profile',
        { headers: { api_key: creds.apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: 'Invalid SaaS Alerts API key.' };
        }
        return { valid: false, error: `SaaS Alerts returned HTTP ${res.status}.` };
      }
      return { valid: true };
    },
  },
```

- [ ] **Step 3: Verify the generic vendor tests still pass** (no count to bump — the count assertion is self-referential)

Run: `npm run typecheck && npm test`
Expected: PASS. (Generic tests enforce: every required field has a header mapping ✓, valid category ✓, valid `docsUrl` URL ✓.) Optionally add `expect(slugs).toContain('saas-alerts');` to `src/credentials/vendor-config.test.ts`.

- [ ] **Step 4: Commit** — `git add src/credentials/vendor-config.ts src/credentials/vendor-config.test.ts && git commit -m "feat: add saas-alerts vendor config"`

### Task A2: Parallel registries (prompt categories, compose, prod bicep, smoke, drift)

**Files:** Modify `src/proxy/prompt-templates.ts`, `docker-compose.yml`, `azure/main.bicep`, `scripts/smoke-test.ts`, `.github/workflows/vendor-drift-audit.yml`.

- [ ] **Step 1: `src/proxy/prompt-templates.ts`** — add `'saas-alerts': 'security',` to the `VENDOR_CATEGORIES` map (alongside `'rocketcyber'`/`'huntress'`/`'blumira'`).

- [ ] **Step 2: `docker-compose.yml`** — add the service block (near the other security vendors):
```yaml
  saas-alerts-mcp:
    image: ghcr.io/wyre-ai/saas-alerts-mcp:latest
    environment:
      - AUTH_MODE=gateway
      - PORT=8080
    expose:
      - "8080"
```
and add to the `gateway` service `environment:` list:
```yaml
      - VENDOR_URL_SAAS_ALERTS=http://saas-alerts-mcp:8080
```

- [ ] **Step 3: `azure/main.bicep`** — add to the `vendors` array (REQUIRED so the prod ACA sidecar deploys — the Liongard "config but no container" failure mode):
```bicep
  { slug: 'saas-alerts', image: 'ghcr.io/wyre-ai/saas-alerts-mcp:latest' }
```

- [ ] **Step 4: `scripts/smoke-test.ts`** — add a read-only canary to `CANARY_TOOLS`:
```typescript
  'saas-alerts': { tool: 'saas_alerts_users_get_msp', args: {} },
```

- [ ] **Step 5: `.github/workflows/vendor-drift-audit.yml`** — append `saas-alerts` to the bash `VENDORS=(...)` array.

- [ ] **Step 6: Verify** — Run: `npm run typecheck && npm run lint && npm test && npm run build` → PASS.

- [ ] **Step 7: Commit + push + PR**
```bash
git add -A && git commit -m "feat: register saas-alerts in compose, prod bicep, prompt categories, smoke, drift audit"
git push -u origin feat/saas-alerts-vendor
gh pr create --repo wyre-technology/mcp-gateway --title "feat: add SaaS Alerts vendor" \
  --body "Registers the saas-alerts vendor (security, API-key auth). Container: ghcr.io/wyre-ai/saas-alerts-mcp. Header: X-SaaS-Alerts-API-Key. Do not merge until the image is published. No prod deploy in this PR."
```
**Do not merge until** `ghcr.io/wyre-ai/saas-alerts-mcp` is published. Aaron merges & deploys.

---

# Deliverable B — Conduit (`conduit-supported-vendors`)

Repo: `/Users/asachs/work/wyre/engineering/projects/conduit-supported-vendors` (worktree for the supported-vendors work; if a file is absent, cross-check `conduit`).

### Task B1: VendorConfig + batch-1 classification (REQUIRED — parity test gate)

**Files:** Modify `src/credentials/vendor-config.ts`, `src/credentials/vendor-batch1.ts`.

- [ ] **Step 1: Branch** — `cd .../conduit-supported-vendors && git checkout -b feat/saas-alerts-vendor`

- [ ] **Step 2: `src/credentials/vendor-config.ts`** — add the **same** `'saas-alerts'` entry as Gateway Task A1 Step 2 (identical object — containerUrl `http://saas-alerts-mcp`, header `X-SaaS-Alerts-API-Key`, the corrected `api_key` validate).

- [ ] **Step 3: `src/credentials/vendor-batch1.ts`** — add `saas-alerts` to `DEFERRED_FROM_BATCH_1_SLUGS` (it is NOT a launch batch-1 vendor):
```typescript
  'saas-alerts': 'post-batch1-add',
```
**Without this the `vendor-canonical-parity.test.ts` fails CI** with `Unclassified vendor(s)... Orphans: saas-alerts`. (No DB migration and no `seed-vendor-registry.ts` edit — the registry is dormant and the seed only iterates batch-1.)

- [ ] **Step 4: Verify** — Run: `npm test` → the parity test and `vendor-config.test.ts` PASS.

- [ ] **Step 5: Commit** — `git add src/credentials/vendor-config.ts src/credentials/vendor-batch1.ts && git commit -m "feat: add saas-alerts vendor config + batch-1 classification"`

### Task B2: Compose + docs + (image-blocked) prod bicepparam

**Files:** Modify `docker-compose.yml`, `docs/src/content/docs/guides/vendor-connections.mdx`, `docs-v2/src/pages/guides/vendor-connections/index.mdx`, `docs/src/content/docs/reference/supported-vendors.mdx`, and (blocked) `azure/vendor-fleet.conduit-prod.bicepparam`.

- [ ] **Step 1: `docker-compose.yml`** — add the service block + `VENDOR_URL_SAAS_ALERTS` (same as Gateway A2 Step 2, but the service env uses `AUTH_MODE=gateway`, `MCP_TRANSPORT=http`, `MCP_HTTP_PORT=8080`).

- [ ] **Step 2: Docs rows** — add a `| SaaS Alerts | \`saas-alerts\` | Security |` row to `docs/src/content/docs/guides/vendor-connections.mdx` and `docs-v2/src/pages/guides/vendor-connections/index.mdx`; add `SaaS Alerts` to the `### Security` line in `docs/src/content/docs/reference/supported-vendors.mdx`.

- [ ] **Step 3: Verify + commit (catalog wiring, no image needed)**
Run: `npm test` → PASS.
```bash
git add -A && git commit -m "feat: saas-alerts compose service + docs"
git push -u origin feat/saas-alerts-vendor
gh pr create --repo wyre-technology/conduit --title "feat: add SaaS Alerts vendor" \
  --body "Catalog wiring for saas-alerts (vendor-config + batch-1 classification + compose + docs). Prod bicepparam (digest-pinned) and tool-classification/result-cache maps follow once the image is published. No deploy here."
```

- [ ] **Step 4 (BLOCKED on published image): `azure/vendor-fleet.conduit-prod.bicepparam`** — resolve the digest and add:
```bash
docker buildx imagetools inspect ghcr.io/wyre-ai/saas-alerts-mcp:latest   # copy the sha256 digest
```
```bicep
  { slug: 'saas-alerts',  image: 'ghcr.io/wyre-ai/saas-alerts-mcp@sha256:<DIGEST>' }
```
Commit to the same branch once unblocked. The bicep template itself is generic — no edit. `vendor-fleet-completeness-check.sh` and `canonical-map.json` need no edit (auto-derived / batch-1 scoped).

### Task B3 (Phase B, blocked on MCP server tool names — now available): fail-closed access maps

**Files:** Modify `src/access/tool-classification.ts`, `src/proxy/result-cache.ts`.

These modules are currently **dormant** but **fail-closed once wired** (unclassified tool → deny / no-cache). Add `saas-alerts` blocks so the vendor isn't silently denied when they activate.

- [ ] **Step 1: Read the existing `rocketcyber` block** in each file (`tool-classification.ts` ~line 396; `result-cache.ts` ~line 873) to capture the exact interface shape (the per-tool keys, e.g. `isWrite`/`isAdmin`/TTL).

- [ ] **Step 2: Add a `'saas-alerts'` block** classifying each tool from the MCP-server canonical table: **reads** (`saas_alerts_navigate`, `saas_alerts_status`, all `*_events_*`, `*_recommended_actions`, `*_customers_list/get`, all `*_users_*`, all `*_devices_*`, all `*_billing_*`, `*_reports_list_scheduled/get_scheduled`, `*_partner_get_profile`) → non-write (cacheable); **writes** (`saas_alerts_customers_create/update/delete/set_whitelists/set_account_whitelists`, `saas_alerts_reports_create_scheduled/delete_scheduled`, `saas_alerts_partner_update_branding`) → `isWrite: true`, no cache. Treat `*_delete*`, `*_set_*whitelists`, `*_update_branding` as `isAdmin` if that key exists.

- [ ] **Step 3: Verify + commit** — `npm test` → PASS; commit to the branch.

> Note: B3 is included for completeness/safety. If the modules remain unwired at merge time, it can ship in a follow-up; it does not block A/B catalog wiring.

---

# Deliverable C — Plugin + Skill + Agent (`msp-claude-plugins`)

Repo: `/Users/asachs/work/wyre/engineering/projects/msp-claude-plugins`. Template: the `blackpoint` plugin (modern `.mcp.json`, WYRE Technology author). Note the **double-nested** path `msp-claude-plugins/saas-alerts/saas-alerts/`.

### Task C1: Plugin files

**Files:** Create under `msp-claude-plugins/saas-alerts/saas-alerts/`: `.claude-plugin/plugin.json`, `.mcp.json`, `README.md`, `skills/api-patterns/SKILL.md`, `skills/triage/SKILL.md`, `agents/saas-alerts-analyst.md`.

- [ ] **Step 1: Branch** — `cd .../msp-claude-plugins && git checkout -b feat/saas-alerts-plugin`

- [ ] **Step 2: `.claude-plugin/plugin.json`**
```json
{
  "name": "saas-alerts",
  "version": "1.0.0",
  "description": "SaaS Alerts - SaaS security monitoring and alerting for M365 / Google Workspace: alerts, events, anomaly detection, and multi-tenant response",
  "author": { "name": "WYRE Technology" },
  "homepage": "https://github.com/WYRE-AI/msp-claude-plugins",
  "repository": "https://github.com/WYRE-AI/msp-claude-plugins",
  "license": "Apache-2.0"
}
```

- [ ] **Step 3: `.mcp.json`** (highest-risk file — header MUST equal the gateway's canonical header `X-SaaS-Alerts-API-Key`)
```json
{
  "mcpServers": {
    "saas-alerts": {
      "type": "http",
      "url": "https://mcp.wyre.ai/v1/saas-alerts/mcp",
      "headers": {
        "X-SaaS-Alerts-API-Key": "${SAAS_ALERTS_API_KEY}"
      }
    }
  }
}
```
Confirm the gateway route slug (`/v1/saas-alerts/mcp`) and inbound header against the merged Deliverable A `vendor-config.ts` before relying on it.

- [ ] **Step 4: `README.md`** — mirror blackpoint headings: `# SaaS Alerts Plugin`, `## What It Does`, `## Installation` (`/plugin install saas-alerts`), `## Configuration` (table: `SAAS_ALERTS_API_KEY`), `## Skills`, `## Tools`, `## License` (Apache-2.0).

- [ ] **Step 5: `skills/api-patterns/SKILL.md`**
```yaml
---
name: "SaaS Alerts API Patterns"
when_to_use: "When working with SaaS Alerts authentication, the MSP/customer/account hierarchy, or paging through alerts and events"
description: >
  Use this skill when working with the SaaS Alerts MCP tools — API-key
  authentication via the gateway header, the MSP/customer/account hierarchy,
  navigation tools, and paging through events, recommended actions, devices,
  and billing.
triggers:
  - saas alerts api
  - saas alerts authentication
  - saas alerts mcp
  - m365 alert triage
---
```
Body headings (mirror blackpoint api-patterns): `## Overview`, `## Connection & Authentication` (document `X-SaaS-Alerts-API-Key` + `SAAS_ALERTS_API_KEY`; note the server maps it to the upstream `api_key` header), `## Hierarchy` (MSP → customer → account/user), `## Navigation Tools` (`saas_alerts_navigate`, `saas_alerts_status`), `## Functional Tool Surface` (the domain tools), `## Event Filters` (`alert_status` low/medium/critical, `event_type` taxonomy, time window), `## Pagination` (scroll cursor), `## Error Handling` (401/403/404/429), `## Best Practices`, `## Related Skills` (link `[[saas-alerts-triage]]`).

- [ ] **Step 6: `skills/triage/SKILL.md`** (the `saas-alerts-triage` skill)
```yaml
---
name: "SaaS Alerts Triage"
when_to_use: "When sweeping and prioritizing the SaaS Alerts queue across tenants and deciding what to escalate"
description: >
  Use this skill to triage SaaS Alerts security alerts across managed M365 /
  Google Workspace tenants — ranking by severity and tenant impact, separating
  true positives from noise, and producing a shift-ready response plan.
triggers:
  - triage saas alerts
  - saas alerts queue
  - prioritize saas alerts
  - m365 security alerts
---
```
Body: `## Overview`, `## API Tools` (which `saas_alerts_*` tools to use for triage), `## Common Workflows` (1: critical-first sweep via `saas_alerts_events_query alert_status:critical`; 2: per-customer summary; 3: cross-tenant pattern via `saas_alerts_events_query_advanced`), `## Severity Model` (low/medium/critical), `## Edge Cases` (empty results are real → do not fabricate; the `emptyGuard` isError signal), `## Best Practices`, `## Related Skills`.

- [ ] **Step 7: `agents/saas-alerts-analyst.md`**
```yaml
---
name: saas-alerts-analyst
description: Use this agent when investigating and triaging SaaS Alerts security alerts across managed M365 / Google Workspace tenants — reconstructing what fired, attributing it to a user/tenant, judging severity, and recommending response. Trigger for: investigate SaaS Alerts alert, triage SaaS Alerts queue, what happened in M365, suspicious login alert, prioritize SaaS Alerts. Examples: "Triage today's SaaS Alerts queue and tell me what to escalate", "Investigate this impossible-travel alert on the Acme tenant".
tools: ["Bash", "Read", "Write", "Glob", "Grep"]
model: inherit
---
```
Body: persona narrative referencing real `saas_alerts_*` tools, then `## Capabilities`, `## Approach` (status check → critical events → per-customer/user attribution → recommended actions → severity call), `## Output Format` (ranked table citing event IDs + customer; escalate/monitor/dismiss verdicts).

- [ ] **Step 8: Commit** — `git add msp-claude-plugins/saas-alerts && git commit -m "feat(saas-alerts): plugin, api-patterns + triage skills, analyst agent"`

### Task C2: Marketplace registration + data regen

**Files:** Modify `.claude-plugin/marketplace.json`, `msp-claude-plugins/docs/scripts/generate-plugins.ts`; regen `msp-claude-plugins/docs/src/data/plugins.ts`.

- [ ] **Step 1: `.claude-plugin/marketplace.json`** — add to `plugins[]`:
```json
{
  "name": "saas-alerts",
  "source": "./msp-claude-plugins/saas-alerts/saas-alerts",
  "description": "SaaS Alerts - SaaS security monitoring and alerting for M365 / Google Workspace: alerts, events, anomaly detection, multi-tenant response",
  "version": "1.0.0",
  "category": "security",
  "tags": ["saas-alerts", "security", "saas-security", "m365", "msp"]
}
```
and bump the top-level `"version"` (e.g. `1.10.0` → `1.11.0`).

- [ ] **Step 2: `msp-claude-plugins/docs/scripts/generate-plugins.ts`** — add to the `vendorMap`: `'saas-alerts': 'SaaS Alerts',` (so it renders as "SaaS Alerts", not "Saas-alerts").

- [ ] **Step 3: Regenerate + verify**
```bash
cd msp-claude-plugins/docs
npm run generate
grep "id: 'saas-alerts'" src/data/plugins.ts        # verify it landed
npm run build                                        # prebuild re-runs the generator; confirms the site builds
```
Expected: `plugins.ts` contains the saas-alerts entry; build succeeds; hero counters auto-increment.

- [ ] **Step 4: Commit + push + PR**
```bash
git add .claude-plugin/marketplace.json \
        msp-claude-plugins/saas-alerts/ \
        msp-claude-plugins/docs/src/data/plugins.ts \
        msp-claude-plugins/docs/scripts/generate-plugins.ts
git commit -m "feat(saas-alerts): register plugin in marketplace + regen docs data"
git push -u origin feat/saas-alerts-plugin
gh pr create --repo wyre-technology/msp-claude-plugins --title "feat: add SaaS Alerts plugin, triage skill, analyst agent" \
  --body "Adds the saas-alerts plugin (security), api-patterns + triage skills, and the saas-alerts-analyst agent. Marketplace + regenerated plugins.ts included. .mcp.json header X-SaaS-Alerts-API-Key matches the gateway vendor-config."
```

---

## Sequencing & gating

1. **A1/A2** (gateway config), **B1/B2 catalog**, and **C** can be authored immediately — they don't need the image.
2. **Merge gating:** A's PR and B's prod bicepparam (B2 Step 4) must not merge/deploy until `ghcr.io/wyre-ai/saas-alerts-mcp` is published by the MCP-server plan.
3. **B3** (tool-classification/result-cache) uses the now-known tool names; ship with B or as a fast follow.
4. Aaron merges and runs the deploys.

## Self-Review

**Spec coverage:** design §6 (gateway + Conduit vendor entry, compose, prod IaC, tests) → Tasks A1–A2, B1–B2 ✓; design §7 (plugin + `saas-alerts-triage` skill + `saas-alerts-analyst` agent + data-regen) → C1–C2 ✓; "branch + PR, no prod/deploy" → every deliverable ends in a PR, prod steps gated ✓.
**Placeholder scan:** the only deferred specifics are the digest (B2 S4, genuinely unknowable until publish — flagged) and the exact `tool-classification`/`result-cache` interface (B3 S1 instructs reading the live `rocketcyber` block, since the agents did not capture it verbatim and the modules are dormant) — both honestly bounded, not lazy TODOs. The full read/write classification of every tool IS specified.
**Type/name consistency:** `X-SaaS-Alerts-API-Key` is byte-identical in A1, B1, and C1 `.mcp.json`; slug `saas-alerts`, container `http://saas-alerts-mcp`, image `ghcr.io/wyre-ai/saas-alerts-mcp`, and canary `saas_alerts_users_get_msp` match the MCP-server plan; the corrected `api_key`-header `validate()` is identical in A and B.
