## 1. Dependencies & Config

- [x] 1.1 Add `winston` and `nest-winston` to `apps/api/package.json` (or root `package.json` if that's the project convention) and run `pnpm install`
- [x] 1.2 Add `LOG_LEVEL` (enum: `error`/`warn`/`info`/`debug`/`verbose`, default `info`) to `apps/api/src/shared/module/config/env.schema.ts`
- [x] 1.3 Add `LOG_FORMAT` (enum: `json`/`pretty`) to the env schema; resolve the default in the schema's transform — `pretty` when `NODE_ENV === 'development'`, else `json`
- [x] 1.4 Add a `logging` config segment under `apps/api/src/shared/module/config/segment/` exposing `level` and `format`
- [x] 1.5 Update `apps/api/.env.example` with the new vars and short comments

## 2. Logging Shared Module — Scaffolding

- [x] 2.1 Create directory `apps/api/src/shared/module/logging/` matching the conventions in `folderStructure.config.mjs`
- [x] 2.2 Add `logging.module.ts` (a `@Module` exporting the nest-winston provider)
- [x] 2.3 Add `index.ts` barrel exporting `LoggingModule`, the request-id middleware, and any public types
- [x] 2.4 Register `@module/shared/logging` path alias in `tsconfig.base.json` (and `tsconfig.spec.json` if needed)
- [x] 2.5 Update dependency-cruiser rules if shared-module additions require it; verify `pnpm nx lint api` passes the project-structure rule

## 3. Winston Factory & Formatters

- [x] 3.1 Implement `factory/winston.factory.ts` — builds a winston `Logger` from `(level, format)`, configures stdout `Console` transport, and applies the format pipeline
- [x] 3.2 Implement `formatter/json.formatter.ts` — single-line JSON with `timestamp` (ISO-8601), `level`, `message`, `context`, plus metadata
- [x] 3.3 Implement `formatter/pretty.formatter.ts` — colorized human-readable format for local dev
- [x] 3.4 Implement `formatter/redact.formatter.ts` — walks metadata and replaces values for the deny-list (case-insensitive: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwt`, `authorization`, `cookie`, `set-cookie`) with `"[REDACTED]"`; export the deny-list as a constant
- [x] 3.5 Compose the formatter pipeline so redaction runs before serialization in BOTH json and pretty modes
- [x] 3.6 Unit-test the JSON formatter: shape, ISO timestamp, context, metadata passthrough
- [x] 3.7 Unit-test the redact formatter: top-level key, nested key, case-insensitive match, email NOT redacted, primitive values for non-listed keys untouched
- [x] 3.8 Unit-test the winston factory: respects level (e.g., `warn` drops `info`), selects format based on input

## 4. Request Correlation Middleware

- [x] 4.1 Implement `middleware/request-id.middleware.ts` — reads `x-request-id`, generates `crypto.randomUUID()` if missing, sets `req.requestId`, sets response header
- [x] 4.2 Attach a child winston logger to `req.log` carrying `{ requestId }`
- [x] 4.3 Register the middleware globally in `app.module.ts` (`configure(consumer)`) so it runs before any route handler
- [x] 4.4 Unit-test the middleware: honors inbound `x-request-id`, generates UUIDv4 when absent, sets response header, attaches `req.log`

## 5. HTTP Access Logging

- [x] 5.1 Implement `middleware/http-access.middleware.ts` — records request start time and emits one log on `res.finish` with `method`, `url`, `statusCode`, `durationMs`, `requestId`; `context: "http"`
- [x] 5.2 Map status code to level: `2xx`/`3xx` → `info`, `4xx` → `warn`, `5xx` → `error`
- [x] 5.3 Register the middleware globally, after the request-id middleware so `requestId` is available
- [x] 5.4 Unit-test the access middleware: emits one record per request, correct level mapping by status, includes durationMs as a number

## 6. Bootstrap Wire-up

- [x] 6.1 Update `apps/api/src/main.ts` to use `NestFactory.create(AppModule, { bufferLogs: true })`
- [x] 6.2 Call `app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))` immediately after `create`
- [x] 6.3 Import `LoggingModule` into `app.module.ts` (must be early so it's available before other modules log)
- [x] 6.4 Smoke test locally with `pnpm nx serve api`: verify pretty logs in dev, then run with `LOG_FORMAT=json LOG_LEVEL=debug` and verify JSON output and debug visibility

## 7. Documentation

- [x] 7.1 Create `docs/adr/0011-structured-logging-with-winston.md` capturing the decision: winston + nest-winston over pino/built-in Logger, redaction-at-formatter, request-id correlation pattern, and the explicit non-goals (error tracking, web, log shipping). Follow the structure of the most recent ADRs (`0010-localstack-for-local-s3.md`, `0008-object-storage-in-shared-module.md`)
- [x] 7.2 Update the **API Module Structure** table in `CLAUDE.md` (under "Monorepo Structure" → API tree comment AND the "Shared module" row) to mention `logging/` alongside `config/`, `mail/`, `persistence/`, `storage/`
- [x] 7.3 Update the **Cross-Module Imports** table in `CLAUDE.md` to add the `@module/shared/logging` row resolving to `src/shared/module/logging/index.ts`
- [x] 7.4 Update the **Environment Variables** section of `CLAUDE.md` to add a "Logging" group with `LOG_LEVEL` and `LOG_FORMAT`
- [x] 7.5 If conventions worth memorizing emerge during implementation (e.g., "always pass structured metadata, never interpolate" or a request-scoped logger pattern), capture them in `CLAUDE.md` under a brief "Logging" subsection of the Coding Standards

## 8. Verification

- [x] 8.1 Run `pnpm nx test api` (unit + int) — all green
- [x] 8.2 Run `pnpm nx test:e2e api` — all green; visually confirm access logs in test output
- [x] 8.3 Run `pnpm nx lint api` — passes including the project-structure rule
- [x] 8.4 Run `pnpm nx typecheck api` — passes
- [x] 8.5 Run `pnpm nx build api` — passes (ensures the new alias resolves at build time)
- [x] 8.6 Run `openspec validate add-structured-logging-baseline --strict` to confirm the change passes its own spec
