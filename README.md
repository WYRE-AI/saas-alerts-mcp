# saas-alerts-mcp

Model Context Protocol server for [Kaseya SaaS Alerts](https://saasalerts.com/) — a SaaS security monitoring platform for M365 and Google Workspace events.

Part of the [WYRE Technology MCP fleet](https://github.com/WYRE-AI).

## Features

Exposes the full SaaS Alerts External Partner API (v0.20.0) through 30 MCP tools organized by domain:

| Domain | Tools |
|--------|-------|
| **events** | Query/count security events by severity, customer, user, event type; advanced Elasticsearch queries; scroll pagination; recommended actions |
| **customers** | List, get, create, update, delete customers; set IP/country and account whitelists |
| **users** | MSP user info, partner users, customer users |
| **devices** | Unify mapped/unmapped/ignored devices, device organizations |
| **billing** | Billing details by date, billing date history |
| **reports** | List/get/create/delete scheduled reports |
| **partner** | Partner profile, branding settings |

Write/destructive tools require user confirmation via MCP elicitation (fail-open: proceeds if client doesn't support elicitation).

## Authentication

SaaS Alerts uses an API key sent as the `api_key` HTTP header.

Generate your API key in the SaaS Alerts UI under **Settings → API Keys**.

### Local / stdio mode

```bash
export SAAS_ALERTS_API_KEY=your-api-key
node dist/index.js
```

### HTTP mode

```bash
export SAAS_ALERTS_API_KEY=your-api-key
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=8080
node dist/http.js
```

### WYRE Gateway mode

When running behind the WYRE MCP Gateway, set `AUTH_MODE=gateway`. The gateway injects the API key per-request via the `X-SaaS-Alerts-API-Key` header — no env var needed.

## Running with Docker

```bash
docker compose up
```

Or pull from GHCR:

```bash
docker run -e SAAS_ALERTS_API_KEY=your-key \
  -e MCP_TRANSPORT=http \
  -p 8080:8080 \
  ghcr.io/wyre-ai/saas-alerts-mcp:latest
```

## Development

```bash
npm install
npm run build
npm test
npm run lint
node scripts/lint-destructive-warnings.mjs src
```

## Destructive tool confirmation

Tools that permanently delete data (customer delete, scheduled report delete) carry:
- `⚠ DESTRUCTIVE — IRREVERSIBLE` description prefix
- `annotations.destructiveHint: true`
- Elicitation confirmation guard (additive — proceeds if client doesn't support elicitation)

Always confirm with the user before invoking these tools.

## License

Apache-2.0 — see [LICENSE](LICENSE).
