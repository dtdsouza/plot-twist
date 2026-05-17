# 0011. Structured logging baseline with winston

Date: 2026-05-17
Status: Accepted

## Context

`apps/api` currently uses NestJS's built-in `Logger` from `@nestjs/common`. Each service does `new Logger('Context')` and emits free-form strings to stdout. There is no request correlation, no PII redaction, and no env-driven log-level control beyond `NODE_ENV`. Log lines are unstructured, which makes them hard to query in a log aggregator and impossible to reliably redact after the fact.

This decision is the logging baseline for DAN-7. Error tracking (Sentry, Bugsnag), frontend logging, and log-shipping infrastructure are explicit follow-ups and are out of scope here.

The codebase already provides the structural patterns this change mirrors:

- A centralized, Zod-validated config module at `src/shared/module/config/` — new env vars are added there.
- A `src/shared/module/{concern}/` convention for cross-cutting NestJS modules (config, mail, persistence, storage). A `logging/` module fits the same shape.
- A `@module/shared/<concern>` path-alias pattern established by ADR-0006.

## Decision Drivers

- **Queryable logs.** Free-form strings cannot be reliably filtered by field; JSON can.
- **Request correlation.** Without a `requestId` attached to every log line for a request, tracing a failure across log lines requires grepping by timestamp proximity — fragile and slow.
- **PII redaction by default.** Sensitive fields (`password`, `token`, `authorization`, etc.) must be scrubbed before reaching stdout, regardless of which service emits them and regardless of developer discipline.
- **Zero-disruption migration.** Existing `new Logger('Ctx')` call sites must keep working without code changes.
- **Env-driven level and format.** Local development deserves a human-readable format; production requires JSON. Both must be selectable without code changes.

## Options Considered

### Option A: pino + nestjs-pino

- Pro: Significantly higher throughput than winston; `pino-http` provides request logging and `requestId` correlation out of the box; widely considered idiomatic for Node.js microservices.
- Con: A more significant dependency swap from the current NestJS Logger baseline; requires some contributor re-education on pino's API.
- Con: The user specifically requested winston for this change.

### Option B: Custom `LoggerService` wrapper with no additional library

Write a custom class implementing NestJS's `LoggerService` interface backed by `console.log` with `JSON.stringify`.

- Pro: Zero new dependencies.
- Con: Requires re-implementing formatter logic, transport management, child-logger semantics, and log-level handling — all batteries that winston ships.
- Con: A non-standard API surface that contributors are unfamiliar with.

### Option C: winston + nest-winston *(chosen)*

- Pro: Mature, widely known library with a rich ecosystem of formatters and transports.
- Pro: `nest-winston` is the canonical NestJS adapter; it provides `WinstonModule`, the `WINSTON_MODULE_NEST_PROVIDER` token, and a `LoggerService` implementation that NestJS can use via `app.useLogger(...)`.
- Pro: The `LoggerService` indirection (a single injection point) means a future swap to pino is a one-module change, with no call-site impact across the rest of the codebase.
- Con: Winston's per-log throughput is lower than pino's. Not material at current scale.

## Decision

**Option C.** Adopt `winston` as the underlying logger and `nest-winston` as the NestJS adapter. The implementation lives in a new shared NestJS module at `src/shared/module/logging/`, exposed via the `@module/shared/logging` path alias.

### Module layout

```
src/shared/module/logging/
├── __tests__/
├── factory/          # winston transport + format factory
├── formatter/        # redact + json/pretty formatters
├── middleware/       # request-id and HTTP access-log middleware
├── logging.module.ts
└── index.ts          # public-API barrel
```

### Wire-up in `main.ts`

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true })
app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
```

`bufferLogs: true` prevents bootstrap log lines from being dropped before `useLogger` is called.

### Log shape

Every log record emitted via JSON format contains: `timestamp` (ISO-8601 UTC), `level`, `message`, `context`, and `requestId` (when present). Additional structured metadata appears as top-level keys.

### Request correlation

A `RequestIdMiddleware` reads `x-request-id` from the incoming request or generates a UUIDv4 when absent, sets `req.requestId`, echoes the value on the response header, and attaches a winston child logger as `req.log`. Code that needs per-request correlation should use `req.log`; singleton-scoped loggers constructed via `new Logger('Ctx')` do not carry `requestId` because they are created at class-init time (see Consequences).

### PII redaction

A winston `format()` step walks the log metadata recursively and replaces values for a deny-listed set of keys (case-insensitive) with `"[REDACTED]"` before serialization. The initial deny-list covers: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwt`, `authorization`, `cookie`, `set-cookie`. Redaction at the formatter layer means even unintentional leaks (e.g., logging the full request body) are caught without relying on developer vigilance at call sites.

### Env vars

| Var | Type | Default | Notes |
|-----|------|---------|-------|
| `LOG_LEVEL` | `error` / `warn` / `info` / `debug` / `verbose` | `info` | Maps 1:1 to winston npm levels |
| `LOG_FORMAT` | `json` / `pretty` | `pretty` in development, `json` otherwise | Resolved in the Zod env schema `transform` |

Both vars are added to `env.schema.ts` and `.env.example`.

### HTTP access logging

One structured log record is emitted per request at completion, with fields `method`, `url`, `statusCode`, `durationMs`, and `requestId`. The `context` is `"http"`. Level is `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx. This is implemented as a Nest middleware in the same module, co-located with the request-id middleware.

### Migration for existing `new Logger('Context')` calls

No call-site changes are required. NestJS delegates `Logger` calls to the logger registered via `app.useLogger(...)`, so existing usages automatically flow into the winston pipeline. The `'Context'` string lands as the `context` field on each JSON record.

## Consequences

### Positive

- Every log emitted in production is a JSON object with a stable, queryable shape. Ingestion by any log aggregator requires no parsing configuration beyond "each line is JSON."
- Log level and format are env-driven; switching from pretty to JSON (or silencing debug output) requires no code change.
- PII redaction runs at the formatter layer, not at call sites. A deny-listed field is scrubbed regardless of where in the codebase it appears in a log message.
- Existing `new Logger('Ctx')` callers keep working without changes.
- The `LoggerService` abstraction means a future migration to pino is a single-module swap.

### Negative / Trade-offs

- Winston throughput is lower than pino. On a high-RPS service this becomes measurable; at current MVP scale it is not. Re-evaluate before public launch.
- Singleton-scoped loggers created via `new Logger('Ctx')` do not carry `requestId`. Correlation is available only in code that explicitly uses `req.log` (or a future request-scoped logger provider). This is the expected trade-off for the zero-disruption migration.
- Local dev output format switches from NestJS's default pretty format to winston pretty. For contributors accustomed to the NestJS default, there is a brief visual adjustment.

### Neutral / Watch

- The PII deny-list is living config under `formatter/`. New sensitive field names (e.g., `apiKey`) must be added explicitly; a unit test enumerating expected redactions surfaces omissions.
- `email` is intentionally not redacted by default (operationally useful for support triage). A partial-mask helper is available for code that opts in. Revisit if a compliance requirement pushes back.

## Non-Goals (out of scope)

- **Error tracking** (Sentry, Bugsnag, Rollbar) — separate DAN-7 follow-up.
- **Frontend logging** (`apps/web`) — out of scope; no NestJS dependency in the web app.
- **Log shipping / aggregation** — logs go to stdout; ingestion is an infrastructure concern.
- **OpenTelemetry / distributed tracing** — logging only in this change.

## Related

- Linear task: [DAN-7 — Error tracking and structured logging baseline](https://linear.app/daniel-souza/issue/DAN-7/error-tracking-and-structured-logging-baseline)
- `openspec/changes/add-structured-logging-baseline/` — proposal, design, and specs for this change
- `openspec/changes/add-structured-logging-baseline/design.md` — full design with rationale and risk register
- ADR-0006: `module/shared/*` and `@module/*` path aliases — the boundary conventions this module follows
- ADR-0001: Env config with Zod — the config module where `LOG_LEVEL` and `LOG_FORMAT` are validated
