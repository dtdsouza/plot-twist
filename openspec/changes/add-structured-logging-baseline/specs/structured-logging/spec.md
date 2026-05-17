## ADDED Requirements

### Requirement: Structured log output

The API SHALL emit logs as single-line JSON objects when `LOG_FORMAT=json`, and as human-readable colorized lines when `LOG_FORMAT=pretty`. Every log record MUST contain `timestamp` (ISO-8601 UTC), `level`, `message`, and `context` fields; additional structured metadata MAY be attached as top-level keys.

#### Scenario: JSON format in production

- **WHEN** the API is started with `LOG_FORMAT=json` and a service calls `logger.info('user registered', { userId: 'u_1' })`
- **THEN** stdout receives a single line that parses as JSON containing `level: "info"`, `message: "user registered"`, `userId: "u_1"`, an ISO-8601 `timestamp`, and a `context` field

#### Scenario: Pretty format in development

- **WHEN** the API is started with `LOG_FORMAT=pretty` (the local-development default)
- **THEN** stdout shows a colorized human-readable line and NOT JSON

### Requirement: Log level controlled by env

The API SHALL read `LOG_LEVEL` from environment configuration (validated by the Zod env schema) and only emit records at or above that severity. Allowed values: `error`, `warn`, `info`, `debug`, `verbose`. Default: `info`.

#### Scenario: Records below threshold are dropped

- **WHEN** `LOG_LEVEL=warn` and a service calls `logger.info('hello')`
- **THEN** no log line is emitted for that call

#### Scenario: Invalid value rejected at boot

- **WHEN** the API starts with `LOG_LEVEL=loud`
- **THEN** boot fails with a Zod validation error before the Nest app is created

### Requirement: Request correlation id

The API SHALL ensure that every HTTP request carries a `requestId`. When the incoming request includes an `x-request-id` header, that value SHALL be used; otherwise the API SHALL generate a UUIDv4. The same `requestId` SHALL be echoed on the response as an `x-request-id` header and SHALL be available on the request object for downstream handlers.

#### Scenario: Honors inbound x-request-id

- **WHEN** a client sends a request with header `x-request-id: abc-123`
- **THEN** the response carries header `x-request-id: abc-123` and `req.requestId === 'abc-123'`

#### Scenario: Generates id when absent

- **WHEN** a client sends a request without `x-request-id`
- **THEN** the response carries an `x-request-id` header whose value matches a UUID v4 pattern

### Requirement: Request-scoped child logger

The API SHALL expose a per-request child logger on the request object as `req.log`. Logs emitted via this child logger MUST include the request's `requestId` field automatically.

#### Scenario: Child logger injects requestId

- **WHEN** a handler calls `req.log.info('processed')` during a request whose `requestId` is `abc-123`
- **THEN** the resulting log record includes `requestId: "abc-123"`

### Requirement: HTTP access logging

The API SHALL emit one structured log record per HTTP request at request completion, with fields `method`, `url`, `statusCode`, `durationMs`, and `requestId`. The record's `context` SHALL be `"http"`. The level SHALL be `info` for `2xx`/`3xx`, `warn` for `4xx`, and `error` for `5xx`.

#### Scenario: Successful request logs at info

- **WHEN** a request `GET /api/health` returns `200`
- **THEN** an access log is emitted with `level: "info"`, `context: "http"`, `method: "GET"`, `url: "/api/health"`, `statusCode: 200`, a numeric `durationMs`, and the request's `requestId`

#### Scenario: Server error logs at error

- **WHEN** a request returns status `503`
- **THEN** the access log is emitted with `level: "error"`

### Requirement: PII redaction

The API SHALL redact values for a configured set of sensitive keys (case-insensitive) anywhere in a log record's metadata before serialization. The deny-list MUST include at least: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwt`, `authorization`, `cookie`, `set-cookie`. Redacted values SHALL be replaced with the literal string `"[REDACTED]"`.

#### Scenario: Top-level sensitive key

- **WHEN** code calls `logger.info('login', { email: 'a@b.com', password: 'hunter2' })`
- **THEN** the emitted record contains `password: "[REDACTED]"` and `email: "a@b.com"` (email is NOT redacted by default)

#### Scenario: Nested sensitive key

- **WHEN** code calls `logger.info('req', { headers: { authorization: 'Bearer abc' } })`
- **THEN** the emitted record contains `headers.authorization: "[REDACTED]"`

#### Scenario: Case-insensitive match

- **WHEN** code calls `logger.info('req', { Authorization: 'Bearer abc' })`
- **THEN** the value is redacted

### Requirement: Drop-in compatibility with NestJS Logger

Existing call sites that use `new Logger('Context')` from `@nestjs/common` SHALL continue to compile and SHALL route their output through the new structured logging pipeline without code changes.

#### Scenario: Existing Logger usage still works

- **WHEN** an existing service emits `new Logger('Identity.AuthService').log('User registered: u_1')`
- **THEN** the record is emitted by winston with `context: "Identity.AuthService"`, `level: "info"`, and the configured format
