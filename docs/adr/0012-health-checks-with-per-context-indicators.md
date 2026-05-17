# 0012. Health checks with per-context indicators

Date: 2026-05-17
Status: Accepted

## Context

The API is the integration point for several external dependencies — PostgreSQL today, Resend (email), S3-compatible object storage, and future Google Books / Google Meet integrations described in `docs/RESILIENCE-OBSERVABILITY.md`. Orchestrators (Docker Compose healthchecks today, Kubernetes liveness/readiness probes later) need a single endpoint they can poll to decide whether the process is serving traffic.

Today there is no `/health` endpoint. Probe failures would manifest only as connection errors at request time, which is too late: the orchestrator cannot route traffic away from a partially degraded instance.

This decision establishes the baseline for DAN-6. Process-level readiness vs. liveness split, weighted aggregation, and per-dependency timeouts are explicit follow-ups and are out of scope here.

## Decision Drivers

- **Single endpoint, multiple signals.** Orchestrator probes hit one URL; the response must surface which dependency failed without forcing the probe to call ten different endpoints.
- **Per-context attribution.** When a probe goes red, the on-call engineer needs to know whether it was the database, the mail provider, or storage — not a generic "unhealthy" boolean.
- **Pluggable as new contexts arrive.** Each bounded context (identity, future books, future reading) brings its own external dependencies. Adding a new indicator must not require editing the health module's controller.
- **Cheap by default.** A health probe must not perform write operations against external systems, and must not be rate-limited like user-facing traffic.
- **Publicly reachable.** Orchestrators don't carry JWTs.

## Options Considered

### Option A: `@nestjs/terminus` with per-context `HealthIndicator` classes

NestJS's first-party terminus integration wraps the underlying `@godaddy/terminus` library and provides:

- A `HealthCheckService.check(indicators[])` aggregator with consistent JSON output and HTTP status (200 ok / 503 error).
- A built-in `TypeOrmHealthIndicator.pingCheck(key)` that issues a cheap `SELECT 1` against the active `DataSource`.
- A `HealthIndicator` base class to extend for context-specific checks.

- Pro: Idiomatic for NestJS 11; minimal boilerplate; aggregator handles the status-code contract.
- Pro: Each context's indicator lives next to that context's code — the same separation already enforced by `docs/MODULAR-PRINCIPLES.md`.
- Con: Adds a dependency.

### Option B: Hand-rolled controller calling each dependency's `ping`-like method

- Pro: No new dependency; we already own the dependencies (`DataSource`, `EmailClient`, `StorageClient`).
- Con: Re-implements terminus's aggregator semantics (timeout per indicator, error envelope, HTTP 503 mapping). Each bug we'd find in our implementation is a bug terminus has already fixed.
- Con: Inconsistent response shape across iterations, which is exactly what orchestrators struggle with.

### Option C: One endpoint per dependency (`/health/db`, `/health/mail`, …)

- Pro: Maximum granularity for probes that only care about one dependency.
- Con: Orchestrators want one URL. Probe configuration multiplies with every new dependency.
- Con: Defers aggregation to the operator, who has no way to express "any of these failing means unhealthy" cleanly.

## Decision

**Use `@nestjs/terminus`. Expose `GET /api/health` from `apps/api/src/shared/module/health/`. Each bounded context contributes its own `HealthIndicator` via composition into the health module.**

For DAN-6, the indicator set is:

- `TypeOrmHealthIndicator.pingCheck('database')` — built-in.

Future contexts add their own indicator (see "How to add a context indicator" below).

The endpoint:

- Returns HTTP 200 with `{ status: 'ok', info, details }` when every indicator passes.
- Returns HTTP 503 with `{ status: 'error', error, details }` when any indicator fails.
- Is decorated with `@SkipThrottle()` so orchestrator probes do not consume the global throttler budget.
- Is mounted under the global `api` prefix (path: `/api/health`).
- Has no auth guard. The application has no global auth guard today; `JwtAuthGuard` is opt-in per controller. The health controller does not opt in.

## How to add a context indicator

A bounded context that owns an external dependency adds an indicator inside its own module — never inside `shared/module/health`. The health module imports indicators by reference; new dependencies do not require editing the health controller in the general case (see "Wiring" below).

```typescript
// src/module/reading/http/health/google-books.indicator.ts
import { Injectable } from '@nestjs/common'
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'
import { BookSearchClient } from '../../core/book-search.client'

@Injectable()
export class GoogleBooksHealthIndicator extends HealthIndicator {
  private static readonly KEY = 'google-books'

  constructor(private readonly bookSearch: BookSearchClient) {
    super()
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      await this.bookSearch.ping()
      return this.getStatus(GoogleBooksHealthIndicator.KEY, true)
    } catch (error) {
      throw new HealthCheckError(
        'Google Books unreachable',
        this.getStatus(GoogleBooksHealthIndicator.KEY, false, {
          message: error instanceof Error ? error.message : 'unknown',
        }),
      )
    }
  }
}
```

Export the indicator from the domain module's barrel (`src/module/reading/index.ts`) so the health module can compose it:

```typescript
// src/module/reading/index.ts
export { GoogleBooksHealthIndicator } from './http/health/google-books.indicator'
```

### Wiring

The health module composes indicators that domain modules expose. Two equally valid patterns:

1. **Direct composition** (simple, suitable for a small number of contexts): the health controller imports indicators by type and adds them to the `health.check([...])` array. The owning domain module re-exports the indicator and provides it.
2. **Token-based registry** (future, when the indicator list grows): contexts register themselves via a multi-provider injection token (`HEALTH_INDICATORS`), and the health controller iterates over the registered indicators. Defer to option 2 only when option 1 starts causing churn in `health.controller.ts`.

### Rules for a new indicator

- **Read-only.** No writes, no state mutation, no side effects.
- **Cheap.** Under 200 ms p99 in steady state. Probes run frequently.
- **Owns its key.** The string key is a stable identifier (`database`, `mail`, `storage`, `google-books`). Keys never collide.
- **Lives in the domain that owns the dependency.** A `Reading` indicator never lives in `shared/`.
- **Failures throw `HealthCheckError`.** The aggregator translates this to HTTP 503; raw exceptions break the response envelope.

## Consequences

- New `@nestjs/terminus` dependency in `package.json` (NestJS 11–compatible release line).
- Every external dependency added in the future owes a health indicator before it can be considered done — codified by the compliance checklist in `docs/RESILIENCE-OBSERVABILITY.md`.
- Orchestrator config (Docker Compose, Kubernetes manifests) can now poll `/api/health` for a single source of truth.
- The health endpoint reveals which dependencies the API uses (the `details` field names each indicator). This is acceptable for an internal-only endpoint; if `/health` is ever exposed publicly, gate the verbose response behind a query param or a separate `/health/detailed` route.
- `@SkipThrottle()` is now a load-bearing decorator on the health controller. Removing it would cause production probes to begin failing once the throttler limit is hit.

## Follow-ups

- Split into `/health/live` (process is up) and `/health/ready` (dependencies are reachable) when Kubernetes deployment lands. Liveness must not fail when the database is unreachable; readiness must.
- Wire indicators for `EmailClient` (Resend) and `StorageClient` (S3) when those contexts grow their own scoped health endpoints.
- Add per-indicator timeout (`@nestjs/terminus` supports it via the indicator's own implementation) once we observe a slow dependency.
