## Why

The API currently emits human-formatted strings through NestJS's built-in `Logger`, which makes logs hard to query, correlate across requests, or ship to a log aggregator. There is no request correlation, no PII redaction, and log level is hard-coded by environment. We need a structured, JSON-first logging baseline before we layer error tracking or production observability on top (DAN-7).

## What Changes

- Adopt **winston** as the underlying logger for `apps/api`, fronted by a NestJS `LoggerService` implementation so existing `Logger` usage migrates with minimal churn.
- Emit **JSON logs** in production / test and **pretty (human) logs** in local development, selectable via env.
- Add a **request-id correlation** field (`requestId`) populated from an incoming `x-request-id` header or generated per request; thread it through logs for the lifetime of the request.
- Add **PII redaction** for known sensitive fields (`password`, `token`, `authorization`, `email` partial mask) at the formatter layer.
- Add `LOG_LEVEL` and `LOG_FORMAT` env vars validated by the existing Zod env schema (`apps/api/src/shared/module/config`).
- Replace ad-hoc `new Logger('Context')` usages in identity, mail, storage with the shared logger via NestJS's standard `LoggerService` injection path (no API change for callers).
- **BREAKING (dev-only)**: local log output format changes from NestJS default to winston pretty; CI/prod is JSON.

## Capabilities

### New Capabilities
- `structured-logging`: A logging capability for `apps/api` covering structured (JSON) output, log levels, request correlation, PII redaction, and the NestJS integration contract.

### Modified Capabilities
<!-- None: no existing capability specs in openspec/specs/ -->

## Impact

- **Code**: `apps/api/src/shared/module/logging/` (new shared module — winston factory, NestJS `LoggerService` adapter, request-id middleware, redaction formatter). Wire-up in `apps/api/src/main.ts` (`app.useLogger(...)`) and `app.module.ts`. Existing `new Logger('Ctx')` sites continue to work via NestJS's logger delegation; no caller changes required.
- **Config**: New env vars `LOG_LEVEL`, `LOG_FORMAT` added to `env.schema.ts` and `.env.example`. Documented in `CLAUDE.md` env table.
- **Dependencies**: Add `winston` and `nest-winston` (NestJS adapter). No new dev runtime dependencies on the web app.
- **Tests**: New unit tests for the logger factory, redaction formatter, and request-id middleware. No changes to existing int/e2e suites — logger swap is observable but not asserted.
- **Out of scope**: error tracking (Sentry et al.), web app (`apps/web`) logging, shipping logs to an external aggregator. These are follow-ups to DAN-7.
