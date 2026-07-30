# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Response byte budget for compact mode: compacted event responses are now
  capped at `MAX_COMPACT_RESPONSE_CHARS` (40,000 characters as serialized by
  the MCP layer). Over-budget hit lists keep only the first K events that fit
  — response order preserved, all envelope metadata (`hits.total`, `_shards`,
  `_scroll_id`, pagination fields) untouched — and the `note` states how many
  of the fetched events are shown and how to get the rest. Scroll responses
  warn that the server-side cursor has already advanced past trimmed events,
  so the fix is re-querying with a smaller size, not continuing the scroll.
  Per-event compaction alone could not bound total size: production queries
  with `size: 200` returned ~199 KB and `size: 500` ~566 KB, breaking client
  display. `verbose: true` remains a complete bypass (raw, uncapped).

### Changed

- Added `@vitest/coverage-v8` to `devDependencies` (matching the installed
  `vitest@^2` major) so `npm run test:coverage` — run by the `Code Quality` CI
  check — no longer fails with `Cannot find dependency '@vitest/coverage-v8'`.

### Fixed

- `/health` liveness endpoint now returns an unconditional `200` instead of `503`
  when no credentials are present. The Azure Container Apps liveness probe calls
  `GET /health` without credentials, so gating the status code on credentials
  caused the probe to fail and ACA to crash-loop the container. Credential
  presence is still reported in the response body (`credentials.configured`).
  The request-scoped credential handling for `/mcp` is unchanged.
