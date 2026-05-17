## Context

`apps/api` currently uses NestJS's default `Logger` (`@nestjs/common`). Each service does `new Logger('Context')` and emits free-form strings. Logs are unstructured, have no correlation between request/response, and leak fields like tokens or `authorization` headers if a developer ever passes them into a log message. There is no env-driven level control beyond `process.env.NODE_ENV`.

The codebase already has the patterns we'll mirror:
- A centralized config module (`src/shared/module/config/`) with a Zod-validated env schema. New env vars go through there.
- A `src/shared/module/{concern}/` convention for cross-cutting NestJS modules (config, mail, persistence, storage). Logging fits the same shape.
- A path-alias barrel pattern (`@module/shared/<concern>`) — see ADR 0006.

This change is the **logging baseline** for DAN-7. Error tracking (Sentry et al.) and frontend logging are explicit follow-ups.

## Goals / Non-Goals

**Goals:**
- One JSON log line per event with a stable shape: `timestamp`, `level`, `message`, `context`, `requestId?`, plus arbitrary structured metadata.
- Pretty, human-readable output in local development (no JSON in the dev terminal).
- Request correlation: every log emitted while handling an HTTP request carries the same `requestId`.
- Redact a known set of sensitive fields anywhere in the metadata tree before serialization.
- Env-driven log level (`LOG_LEVEL`) and format (`LOG_FORMAT=json|pretty`) validated by Zod.
- Zero behavior change for existing `new Logger('Context')` callers — they continue to compile and emit through the new pipeline via `app.useLogger(...)`.

**Non-Goals:**
- Error tracking / exception reporting (Sentry, Bugsnag) — separate follow-up.
- Frontend (`apps/web`) logging.
- Log shipping / aggregation (Loki, CloudWatch, Datadog) — logs go to stdout; ingestion is infra-level.
- Per-domain logger context conventions beyond what's already in use.
- Tracing / OpenTelemetry spans (logging only).

## Decisions

### 1. Library: `winston` + `nest-winston`

We use `winston` for the core logger and `nest-winston` to expose it as a NestJS `LoggerService` and provide DI tokens.

**Alternatives considered:**
- **pino + nestjs-pino** — faster and more idiomatic for high-throughput services, with a built-in `pino-http` request logger. Better long-term choice for hot paths.
- **NestJS Logger with custom transport** — minimal deps but means re-implementing formatters, levels, and child-logger semantics.

**Rationale:** The user asked for winston specifically. Winston is mature, well-known to most contributors, and `nest-winston` is the canonical Nest adapter; the perf delta vs. pino is irrelevant at our current scale. If we later need pino-level throughput, the abstraction (a single `LoggerService` consumed via Nest's standard injection) lets us swap underneath.

### 2. Module location and shape: `src/shared/module/logging/`

A new shared NestJS module exposed via the `@module/shared/logging` path alias. Public barrel exports `LoggingModule` plus any helpers (e.g., a `RequestIdMiddleware`). The internal layout follows the existing shared-module conventions:

```
src/shared/module/logging/
├── __tests__/
├── factory/                    # winston transport + format factory
├── formatter/                  # redact + json/pretty formatters
├── middleware/                 # request-id middleware
├── logging.module.ts
└── index.ts                    # public-API barrel
```

Wire-up in `apps/api/src/main.ts`:

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true })
app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
```

`bufferLogs: true` ensures bootstrap logs aren't dropped before `useLogger` is called.

**Why not a `libs/` library?** Logging is API-only for now and depends on NestJS (`LoggerService` contract, middleware). If `apps/web` ever needs a structured logger, that will be a separate library with no NestJS dependency.

### 3. Env vars and config

Added to `env.schema.ts` (Zod) and `.env.example`:

| Var | Type | Default | Notes |
|---|---|---|---|
| `LOG_LEVEL` | enum: `error`/`warn`/`info`/`debug`/`verbose` | `info` | Maps 1:1 to winston levels (npm levels) |
| `LOG_FORMAT` | enum: `json`/`pretty` | `pretty` in development, `json` otherwise | Resolved in the env schema's `transform`, not at logger init |

The config module exposes these via the existing `ConfigService` segment pattern (see `src/shared/module/config/segment/`).

### 4. Request correlation

A small Nest middleware reads `x-request-id` from the incoming request and, if absent, generates one (`crypto.randomUUID()`). It sets the value on `req.requestId` and on the response header so clients can correlate.

To propagate `requestId` into log lines without threading it through every call, we use winston's `child` loggers scoped per request:

- `RequestIdMiddleware` creates a child logger with `{ requestId }` and attaches it to `req.log`.
- Services that want request-scoped logs inject the request (or use the existing Nest `Logger` injection — see decision 5 below for the trade-off).

**Trade-off:** Decision 5 keeps `new Logger('Ctx')` calls working, but those calls cannot see the per-request child logger because they're constructed at class-init time. That's acceptable for the baseline: top-level requestId still appears on HTTP access logs and on any code explicitly using `req.log`. A follow-up can introduce a `REQUEST` scoped logger provider if we need universal correlation.

### 5. Migration path for existing `new Logger('Context')` calls

We **do not** change call sites in this proposal. NestJS's `Logger` from `@nestjs/common` delegates to whatever logger is set via `app.useLogger(...)`, so existing usages flow into winston automatically. The `'Context'` string lands as the `context` field on the JSON record.

This is the minimum-risk migration. Targeted call-site upgrades (structured metadata instead of interpolated strings) can happen incrementally.

### 6. PII redaction

A winston `format()` step walks the `meta` payload and replaces values for a deny-listed set of keys before serialization. Keys (case-insensitive): `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwt`, `authorization`, `cookie`, `set-cookie`. Email is **not** redacted by default (operationally useful for support); a partial-mask helper is exposed for code that wants to opt in.

Redaction runs at the formatter level, not at call sites, so even a developer mistake (passing the whole request body) is caught.

### 7. HTTP access logging

In scope: a minimal access log emitted at the end of each request (`method`, `url`, `statusCode`, `durationMs`, `requestId`). Implemented as a Nest middleware in the same module to keep request-id and access logs co-located. Not a full `morgan`-style log — just structured fields useful for triage.

## Risks / Trade-offs

- **[Risk]** Winston's perf on hot paths is lower than pino; a high-RPS service could spend measurable CPU formatting.
  **Mitigation:** Acceptable at MVP scale. Re-evaluate before public launch; the `LoggerService` indirection makes a swap straightforward.

- **[Risk]** Existing `new Logger('Ctx')` calls won't carry `requestId` because they're singleton-scoped.
  **Mitigation:** Document the gap. Most logs that need correlation come from request-scoped services that can use `req.log` or be migrated to a request-scoped logger in a follow-up.

- **[Risk]** Switching local-dev output format will surprise contributors used to Nest's pretty output.
  **Mitigation:** Default `LOG_FORMAT=pretty` in development and document in CLAUDE.md + `.env.example`. JSON only kicks in for `NODE_ENV !== 'development'` unless overridden.

- **[Risk]** Redaction deny-list misses a field name (e.g., a future `apiKey` field).
  **Mitigation:** Treat the deny-list as living config under the `formatter/` folder, with a unit test enumerating expected redactions. Add fields as we learn.

- **[Risk]** Bootstrap log lines (before `app.useLogger`) drop to default formatting.
  **Mitigation:** `bufferLogs: true` on `NestFactory.create`; flush after `useLogger`.

## Migration Plan

1. Add deps, env vars, and the `logging` shared module behind no feature flag — strictly additive.
2. Wire `app.useLogger` in `main.ts`. Verify locally that existing log lines now appear in winston pretty format.
3. Add request-id middleware globally. Verify `x-request-id` appears on responses.
4. Add HTTP access middleware. Verify access logs in dev.
5. Update `.env.example` and `CLAUDE.md` (env table, API module structure, cross-module import alias).
6. Record the decision as `docs/adr/0011-structured-logging-with-winston.md`.

No rollback work needed beyond reverting the PR — there are no schema or data changes.

## Open Questions

- Do we want `request-id` as `x-request-id` (lowercase, common) or `X-Request-Id`? Default to lowercase; trivial to change.
- Should `email` be partial-masked by default in the redaction step? Current decision: no. Revisit if compliance pushes back.
