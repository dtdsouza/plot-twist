---
title: "refactor: Test data factories with raw pg, isolated from production repositories"
type: refactor
status: completed
date: 2026-05-14
---

# Test Data Factories with Raw pg

## Overview

Replace the current test-data setup pattern — which seeds rows by calling production services (`service.register()`) and ad-hoc `dataSource.query` snippets — with a co-located test-support layer that inserts rows directly via a raw `pg` pool. Each domain module owns its own factories under a `__test-support__/` subfolder, mirroring how the module already owns its entities, repositories, and migrations. Shared infrastructure (pg pool, schema setup, truncate) lives under `module/shared/__test-support__/`. Factories never import production repositories, services, or entity classes.

A small follow-on removes `BaseRepository.delete(id)`, which is reachable only from tests today.

## Problem Frame

DB-touching tests (`*.int-spec.ts` and `*.e2e-spec.ts` under `apps/api/src/module/identity/`) currently mix three concerns into the same test bodies:

1. **Driving the system under test** (calls to the service or HTTP endpoint being tested).
2. **Seeding fixtures** via the same production code path (`service.register()` to materialize a user, then logging in to get a JWT).
3. **Setting up edge-case rows** that no service exposes (expired tokens, used tokens) via inline `dataSource.query` SQL.

The mix has three costs:

- A regression in `register()` cascades through every test that uses it for setup, masking failures elsewhere.
- Inline SQL fixtures are duplicated across files and grow when new edge cases are added.
- `BaseRepository.delete(id)` exists only because its sibling tests need it; production deletes go through `dataSource.manager.delete(...)` inside transactions or repository-specific helpers (`deleteAllForUser`). Production code carries a test-only escape hatch.

Segregating "create rows the test needs" from "exercise the code under test" makes tests faster, more independent, and lets us strip dead production code.

## Requirements Trace

- R1. Tests must seed rows without invoking production services or repositories.
- R2. Factory inserts must use raw `pg` (already a project dependency), no new dependency added.
- R3. Factories and shared test-support helpers must be excluded from the production build (via `tsconfig.app.json`) so they are never bundled when no prod file imports them.
- R4. Every existing DB-touching test in `apps/api` (int + e2e) must migrate to the factory API in the same change set so the old patterns are gone.
- R5. `BaseRepository.delete(id)` must be removed from production code once tests no longer need it.
- R6. Factories must support per-test cleanup that is independent of any other test's ordering.

## Scope Boundaries

- **In scope:** test-support infrastructure under `apps/api/src/module/shared/__test-support__/`, identity factories under `apps/api/src/module/identity/__test-support__/`, migration of `auth.service.int-spec.ts`, `auth.controller.e2e-spec.ts`, `user.controller.e2e-spec.ts`, `avatar.e2e-spec.ts`, the `tsconfig.app.json` exclude rule, and removal of `BaseRepository.delete`.
- **Out of scope:** changing the production repository API surface beyond removing `delete`. `deleteAllForUser` stays (production uses it).
- **Out of scope:** introducing Knex, a query builder, or any new dependency. Raw `pg` only.
- **Out of scope:** refactoring `TypeOrmModule.forRoot(...)` test bootstrap or moving to a shared test module — leave the existing module-compile patterns alone unless a migration forces a change.
- **Out of scope:** migrating unit specs (e.g., `*.spec.ts` that mock the TypeORM repository). They do not touch the DB.
- **Non-goal:** schema migrations. Tests continue to rely on `synchronize: true` plus `CREATE SCHEMA IF NOT EXISTS identity`.

## Context & Research

### Relevant Code and Patterns

- **Current DB-touching tests** (the migration targets):
  - `apps/api/src/module/identity/core/__tests__/auth.service.int-spec.ts`
  - `apps/api/src/module/identity/http/controller/__tests__/auth.controller.e2e-spec.ts`
  - `apps/api/src/module/identity/http/controller/__tests__/user.controller.e2e-spec.ts`
  - `apps/api/src/module/identity/__tests__/avatar.e2e-spec.ts`
- **Existing raw-pg pattern in tests:** the `beforeAll` in each spec already constructs a `pg.Client` to run `CREATE SCHEMA IF NOT EXISTS identity`. The factory layer formalizes and shares that connection.
- **Entities are the source of truth for column names** but factories must not import them. See "Key Technical Decisions" for how drift is detected.
  - `apps/api/src/module/identity/persistence/entity/user.entity.ts`
  - `apps/api/src/module/identity/persistence/entity/password-reset-token.entity.ts`
  - `apps/api/src/module/identity/persistence/entity/email-change-token.entity.ts`
- **BaseEntity's id default** (`gen_random_uuid()`): factories rely on the DB default and `RETURNING id, "createdAt", "updatedAt"` so the inserted row matches what TypeORM would produce. See `apps/api/src/module/shared/typeorm/base.entity.ts` and ADR 0005.
- **Schema isolation rule** (ADR 0006, `STATE-ISOLATION.md`): identity tables are in the `identity` schema. Factories must quote schema + table (`identity."user"`).
- **`BaseRepository.delete` callers**: only `apps/api/src/module/shared/typeorm/__tests__/base.repository.spec.ts` (verified by grep). No production caller.

### Institutional Learnings

- Tests need `CREATE SCHEMA IF NOT EXISTS identity` **before** `TypeORM synchronize` (recorded in project memory). The factory's schema-setup helper must run before the TypeORM module compiles.
- `localhost` resolves to `::1` (IPv6) on the dev host; tests use `127.0.0.1`. The pg pool helper must default to `127.0.0.1` for parity.

### External References

Not warranted. Patterns are already in the repo; no library docs need consulting for a raw-`pg` factory layer.

## Key Technical Decisions

- **Co-located test support: each module owns its factories under `__test-support__/`.**
  - Identity factories: `apps/api/src/module/identity/__test-support__/factories/`.
  - Shared test infra (pg pool, schema setup, truncate): `apps/api/src/module/shared/__test-support__/db/`.
  - Rationale: this mirrors how modules already own their entities, repositories, and migrations. When a column is added to `UserEntity`, the factory that mirrors it sits in the same module tree — drift surfaces in the same diff. When a module is deleted, its test scaffolding goes with it. This matches the project-wide module-ownership principle (CLAUDE.md, ADR 0006, `STATE-ISOLATION.md`).
- **Isolation mechanism: `tsconfig.app.json` excludes `src/**/__test-support__/**`.**
  - The production build (webpack via Nx) follows `tsconfig.app.json` and will not pick up `__test-support__/` as a *root*. `tsconfig.spec.json` re-includes it (overriding `exclude`) so Jest + ts-jest see it.
  - **Honest limitation:** tsconfig `exclude` is passive, not active. If a production file ever writes `import { createUser } from '../__test-support__/...'`, TypeScript resolves the source by reference and pulls it into the build anyway. The exclude prevents *unintentional* inclusion, not *intentional* misuse.
  - Active prevention (forbidding the import at all) would require a dep-cruiser rule. Not adopted here per your call; flagged in Risks for a future tightening.
- **Path aliases for test imports.**
  - Add `@module/identity/test-support` → `src/module/identity/__test-support__/index.ts` and `@module/shared/test-support` → `src/module/shared/__test-support__/index.ts` to `tsconfig.spec.json` only.
  - **Do not add these aliases to `tsconfig.app.json`.** That way production code that tries to import via the alias fails to resolve at build time — a second, complementary guardrail to the exclude.
- **Driver: raw `pg.Pool`, no Knex.**
  - Rationale: `pg` is already a dependency; tests already use `pg.Client` for schema setup. A query builder adds no value at the scale of identity (3 tables, simple inserts).
- **Factories own their row types; they do not import entity classes.**
  - Rationale: the goal is total isolation. Factories define a local `UserRow` interface mirroring the table columns. If columns drift, the factory's insert fails at runtime against a real DB — caught immediately by the integration suite, which is the desired contract.
- **One shared `pg.Pool` per Jest worker, torn down in a global teardown / `afterAll`.**
  - Rationale: `pg.Pool` is cheap to share within a worker and avoids the connection-per-test overhead. Jest runs workers in separate processes, so cross-worker contention is not an issue.
- **Per-test cleanup via `TRUNCATE ... RESTART IDENTITY CASCADE`** on the identity tables, called from a single helper.
  - Rationale: replaces the current `DELETE FROM ... WHERE email LIKE '%@int.test'` patterns, which are fragile (depend on test email conventions) and slower than truncate on small tables.
- **Password hashing strategy in the user factory:**
  - Factory accepts an optional `plainPassword`. If provided, it bcrypts with cost 12 (matches prod). If omitted, it uses a pre-computed hash of a constant test password exported as `TEST_DEFAULT_PASSWORD`.
  - Rationale: tests that don't care about the password pay no bcrypt cost; tests that verify login round-trips set their own password explicitly.
- **JWT generation in e2e tests after migration:**
  - Today the avatar e2e calls `POST /api/auth/register` purely to harvest a JWT. After the migration, tests should mint a JWT directly via the `JwtService` already in the testing module, given a `userId` produced by the factory. One fewer cross-cutting HTTP call in setup.
- **Migration is bundled, not incremental.**
  - Rationale: per R4, the old patterns must go away. A half-migrated suite leaves the dead patterns alive and the dead-code removal blocked. The diff is contained to test files.

## Open Questions

### Resolved During Planning

- **Knex vs raw `pg`?** Raw `pg` — confirmed by user; avoids a new dependency.
- **Where do factories live: out-of-module (`apps/api/test/`) or co-located in each module (`__test-support__/`)?** Co-located. The module-ownership principle wins over the slightly stronger physical isolation of out-of-module. Drift between an entity and its factory becomes a same-module concern, which matches how migrations are already organized.
- **How is test code kept out of the production build?** `tsconfig.app.json` excludes `src/**/__test-support__/**`; `tsconfig.spec.json` overrides the exclude so Jest sees it. Path aliases for test imports are added to `tsconfig.spec.json` only. Accepted limitation: this is passive isolation, not active prevention. See Risks.
- **Should factories import entity classes for column lists?** No — see Key Technical Decisions. Local row types preserve isolation; drift is caught by the integration suite running against a real DB.

### Deferred to Implementation

- **Whether to add a `jest.config.js` `globalSetup`/`globalTeardown` for the shared `pg.Pool`,** or keep pool lifecycle inside each spec's `beforeAll`/`afterAll`. Either works; pick whichever requires fewer config touches once the first migration is in.
- **Exact path alias for test helpers.** Path alias may not be necessary if tests use relative imports (`../../../../test/factories`). If imports get ugly, add a `@test/*` alias to the test `tsconfig.spec.json` and update `jest.config.js` `moduleNameMapper`.
- **Whether `email_change_token` truncate must precede `password_reset_token`** or whether `CASCADE` handles it. Verify when wiring the cleanup helper.

## Implementation Units

- [ ] **Unit 1: Shared test-support skeleton (pg pool, schema setup, cleanup) + tsconfig wiring**

**Goal:** Establish `module/shared/__test-support__/` with a shared `pg.Pool`, the schema-setup helper that current tests inline, and per-schema cleanup helpers. Wire `tsconfig.app.json` to exclude `__test-support__/` and `tsconfig.spec.json` to include it with the new path aliases.

**Requirements:** R1, R2, R3, R6

**Dependencies:** none

**Files:**
- Create: `apps/api/src/module/shared/__test-support__/db/pool.ts`
- Create: `apps/api/src/module/shared/__test-support__/db/schema-setup.ts`
- Create: `apps/api/src/module/shared/__test-support__/db/cleanup.ts`
- Create: `apps/api/src/module/shared/__test-support__/db/__tests__/cleanup.spec.ts` (smoke spec)
- Create: `apps/api/src/module/shared/__test-support__/index.ts` (barrel — re-exports `getTestPool`, `closeTestPool`, `ensureIdentitySchema`, `truncateIdentity`)
- Modify: `apps/api/tsconfig.app.json` — add `"src/**/__test-support__/**"` to `exclude`
- Modify: `apps/api/tsconfig.spec.json` — explicitly override `exclude` (drop `__test-support__` from it) and add the two new path aliases (`@module/identity/test-support`, `@module/shared/test-support`)
- Modify: `apps/api/jest.config.js` — add `moduleNameMapper` entries for `^@module/identity/test-support$` and `^@module/shared/test-support$` so ts-jest resolves them at runtime

**Approach:**
- `pool.ts` exports a lazy singleton `getTestPool()` reading `DB_HOST` (default `127.0.0.1`), `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` from `process.env`. Also exports `closeTestPool()`. Pool `max` capped at 4.
- `schema-setup.ts` exports `ensureIdentitySchema()` that runs `CREATE SCHEMA IF NOT EXISTS identity` via the pool. Replaces the inline `pg.Client` block in every spec's `beforeAll`. Future domains add their own `ensureXxxSchema()` next to this one.
- `cleanup.ts` exports per-schema truncate helpers (e.g., `truncateIdentity()`). Each domain owns its truncate list, but the helpers themselves live in the shared layer because they share the pool.
- Barrel exposes only the names tests should call; internals stay unexported.

**Patterns to follow:**
- Connection params: `auth.service.int-spec.ts:33-44`.
- The existing `tsconfig.app.json` already excludes `src/**/__tests__/**` and the various `*-spec.ts` patterns; the new `__test-support__/**` exclude follows the same shape.
- The existing path-alias pattern in `tsconfig.app.json` / `tsconfig.spec.json` (each alias paired with a barrel `index.ts`). Test-support aliases follow the same convention but live in `tsconfig.spec.json` only.

**Test scenarios:**
- Happy path: `ensureIdentitySchema()` is idempotent — running it twice on the same DB does not throw.
- Happy path: `truncateIdentity()` removes rows previously inserted via raw `pool.query('INSERT ...')`, leaving zero rows in all three identity tables.
- Edge case: `truncateIdentity()` on already-empty tables completes without error.
- Integration: `pnpm nx build api` succeeds with the new exclude in place — `__test-support__/` files do not enter the production build. Confirmed by inspecting `apps/api/dist` for the absence of any `__test-support__` artifacts after a clean build.

**Verification:**
- The cleanup spec runs green against a live local Postgres (started via `docker compose up postgres -d`).
- `pnpm nx build api` produces a dist with no `__test-support__` files.

---

- [ ] **Unit 2: Identity row factories**

**Goal:** Provide `createUser`, `createPasswordResetToken`, `createEmailChangeToken` factories that insert directly via the pool, return the inserted row, and accept partial overrides.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 1

**Files:**
- Create: `apps/api/src/module/identity/__test-support__/factories/user.factory.ts`
- Create: `apps/api/src/module/identity/__test-support__/factories/password-reset-token.factory.ts`
- Create: `apps/api/src/module/identity/__test-support__/factories/email-change-token.factory.ts`
- Create: `apps/api/src/module/identity/__test-support__/index.ts` (barrel for identity test-support — re-exports factories and the `TEST_DEFAULT_PASSWORD` constant)
- Create: `apps/api/src/module/identity/__test-support__/factories/__tests__/user.factory.spec.ts`
- Create: `apps/api/src/module/identity/__test-support__/factories/__tests__/password-reset-token.factory.spec.ts`
- Create: `apps/api/src/module/identity/__test-support__/factories/__tests__/email-change-token.factory.spec.ts`

**Approach:**
- Each factory defines a local `Row` interface matching the table columns it inserts/returns (no import of `UserEntity` etc.). Factory files import only from `@module/shared/test-support` (for `getTestPool`), `node:crypto`, and `bcryptjs`.
- `createUser({ overrides? })` defaults: unique email per call (e.g., `user-${uuid}@factory.test`), bcrypt'd `TEST_DEFAULT_PASSWORD` (pre-computed constant exported by the module's test-support barrel), random `displayName`, `status` = `'active'`. `plainPassword` override triggers a fresh bcrypt at cost 12.
- `createPasswordResetToken({ userId, overrides? })` requires `userId`. Defaults: random 64-char `tokenHash`, `expiresAt` = `now() + 1h`. `expiresAt` override allows expired/used scenarios.
- `createEmailChangeToken` mirrors the password-reset factory with `newEmail` required.
- All factories use parameterized queries (`$1`, `$2`, ...) with `RETURNING id, "createdAt", "updatedAt"` so the returned object mirrors what TypeORM-issued inserts would produce.
- The identity test-support barrel exports a `TEST_DEFAULT_PASSWORD` constant and its pre-computed bcrypt hash; the hash is computed once at module load and cached.

**Patterns to follow:**
- Column quoting and schema prefix: `identity."user"`, `"passwordHash"`, `"createdAt"` (matches existing inline SQL in `auth.service.int-spec.ts`).
- Default values for nullable columns: `avatar` and `bio` default to `NULL` (entity already declares `default: null`).

**Test scenarios:**
- Happy path: `createUser()` with no overrides inserts a row, returns a `UserRow` with a UUID `id`, a `createdAt` and `updatedAt` populated, and `passwordHash` matching `TEST_DEFAULT_PASSWORD` via `bcrypt.compare`.
- Happy path: `createUser({ email, plainPassword })` inserts the supplied email and a fresh bcrypt of the supplied password; `bcrypt.compare` verifies.
- Edge case: calling `createUser()` twice produces two distinct rows with distinct emails (uniqueness preserved).
- Error path: `createUser({ email })` for an already-inserted email rejects with the `pg` unique-violation error (code `23505`) — factories do not swallow errors.
- Happy path: `createPasswordResetToken({ userId })` inserts a row referencing the user, with `expiresAt` ≈ `now() + 1h`.
- Edge case: `createPasswordResetToken({ userId, expiresAt: past })` produces an already-expired token row (used by `resetPassword` rejection tests).
- Integration: a user created by `createUser` can be loaded by raw SQL exactly as a TypeORM-inserted user would be (same column set, same `id` shape).

**Verification:**
- Factory specs pass against a live Postgres after `ensureIdentitySchema()` and `truncateIdentity()`.

---

- [ ] **Unit 3: Migrate `auth.service.int-spec.ts` to factories**

**Goal:** Replace every `service.register(...)` and inline `dataSource.query('INSERT/DELETE ...')` call with the new factory API. Keep the assertions identical.

**Requirements:** R1, R4

**Dependencies:** Unit 2

**Files:**
- Modify: `apps/api/src/module/identity/core/__tests__/auth.service.int-spec.ts`

**Approach:**
- Imports added at top of spec: `import { ensureIdentitySchema, truncateIdentity, closeTestPool } from '@module/shared/test-support'` and `import { createUser, createPasswordResetToken } from '@module/identity/test-support'`.
- Replace the `pg.Client` block in `beforeAll` with `await ensureIdentitySchema()`.
- Replace the `DELETE FROM identity.* WHERE email LIKE '%@int.test'` blocks in `beforeEach`/`afterAll` with `await truncateIdentity()`. Call `await closeTestPool()` in `afterAll` so the shared pool drains.
- Replace `await service.register(dto)` setups (lines 155-156, 188, 208, 235, 257, 278, 301, 340, 378, 412) with `await createUser({ email: dto.email, plainPassword: dto.password, displayName: dto.displayName })` — keeping the same `dto` object so the rest of the test reads identically.
- Replace inline INSERT for password-reset tokens (lines 317-320, 355-358, 394-397, 427-430) with `await createPasswordResetToken({ userId, tokenHash, expiresAt })`.
- Drop the manual `SELECT id FROM identity."user" WHERE email = $1` lookup — `createUser` returns `userId` directly.

**Patterns to follow:**
- Keep assertions on `dataSource.query('SELECT ...')` as-is; only the *setup* path migrates. The system-under-test still reads/writes via the real services.

**Test scenarios:**
- The migrated suite passes with identical assertion outcomes as the pre-migration suite. No behavioral change is expected.
- Confirm `mockEmailClient.send.mockClear()` still runs in `beforeEach` after the simplification.

**Verification:**
- `pnpm nx test api --configuration=int` passes locally with no skipped tests and no new flakiness.

---

- [ ] **Unit 4: Migrate `auth.controller.e2e-spec.ts` and `user.controller.e2e-spec.ts`**

**Goal:** Same substitution as Unit 3, applied to the controller-level e2e specs.

**Requirements:** R1, R4

**Dependencies:** Unit 2

**Files:**
- Modify: `apps/api/src/module/identity/http/controller/__tests__/auth.controller.e2e-spec.ts`
- Modify: `apps/api/src/module/identity/http/controller/__tests__/user.controller.e2e-spec.ts`

**Approach:**
- Imports: `@module/shared/test-support` (for schema setup, truncate, pool teardown) and `@module/identity/test-support` (for factories).
- Same `ensureIdentitySchema()` / `truncateIdentity()` substitution in the lifecycle hooks.
- Setup that today calls `POST /api/auth/register` purely to seed a user gets replaced with `await createUser(...)`. Setup that calls `register` *as the system under test* stays untouched.
- For tests that need an authenticated request, mint a JWT via the `JwtService` provided by the testing module: `module.get(JwtService).sign({ sub: userId, email })`. This removes the implicit dependency on `register` and `login` for authenticated setup.

**Patterns to follow:**
- JWT payload shape: read from `apps/api/src/module/identity/core/auth.service.ts` (registration's `sign` call) so the minted token matches what production would emit.

**Test scenarios:**
- All originally-failing controller flows still produce the same response codes and bodies.
- An authenticated test using a factory-seeded user + minted JWT successfully hits a `JwtAuthGuard`-protected endpoint.

**Verification:**
- `pnpm nx test:e2e api` passes locally (Postgres + LocalStack up).

---

- [ ] **Unit 5: Migrate `avatar.e2e-spec.ts`**

**Goal:** Same substitution applied to the avatar e2e suite, plus removal of the `POST /api/auth/register` setup call that exists only to produce a JWT.

**Requirements:** R1, R4

**Dependencies:** Unit 2

**Files:**
- Modify: `apps/api/src/module/identity/__tests__/avatar.e2e-spec.ts`

**Approach:**
- Imports: `@module/shared/test-support` and `@module/identity/test-support`.
- Replace inline schema bootstrap (lines 93-103) with `await ensureIdentitySchema()`.
- Replace `DELETE FROM identity."user" WHERE email LIKE '%@e2e.test'` (lines 170-172, 184-186) with `await truncateIdentity()`.
- Replace the `register` setup (lines 174-180) with `const user = await createUser({ email: seededUser.email, plainPassword: seededUser.password, displayName: seededUser.displayName })` plus `const token = module.get(JwtService).sign({ sub: user.id, email: user.email })`.
- Keep all S3 / LocalStack interactions unchanged.

**Patterns to follow:**
- JWT payload again must match `auth.service.ts` so `JwtAuthGuard` accepts it.

**Test scenarios:**
- The full intent → S3 → finalize round-trip still publishes a public avatar URL.
- The "replaces an existing avatar" path still removes the prior object.
- All 401 / 400 / 403 guard cases still produce the same status codes.

**Verification:**
- `pnpm nx test:e2e api` passes with LocalStack up.

---

- [ ] **Unit 6: Remove `BaseRepository.delete` and its spec coverage**

**Goal:** Delete the test-only `delete(id)` method from `BaseRepository` and its spec.

**Requirements:** R5

**Dependencies:** Units 3, 4, 5 (so no test still depends on it — confirm via grep before deletion)

**Files:**
- Modify: `apps/api/src/module/shared/typeorm/base.repository.ts` (remove `delete` method)
- Modify: `apps/api/src/module/shared/typeorm/__tests__/base.repository.spec.ts` (remove the `describe("delete", ...)` block)

**Approach:**
- Grep `\.delete\(` and `BaseRepository` in `apps/api/src/` *outside* the file being modified to confirm there are zero callers. The existing audit (Phase 1 of this plan) shows none, but re-verify just before the delete.
- Removing the method is the entire prod-code change; no other adjustments needed.

**Patterns to follow:**
- ADR 0006 path-alias rule: production code already imports `BaseRepository` via `@module/shared/typeorm`. No barrel change needed because `delete` was a method, not an export symbol.

**Test scenarios:**
- The remaining `BaseRepository` spec (covering `findOne`, `findMany`, `create`, `update`) still passes.
- A grep across `apps/api/src/` confirms zero references to `BaseRepository.prototype.delete` (or `super.delete(`) — recorded in PR description as evidence.

**Verification:**
- `pnpm nx test api` and `pnpm nx test:e2e api` both pass.
- `pnpm nx build api` succeeds (would fail if any caller had been overlooked).

## System-Wide Impact

- **Interaction graph:** factories bypass NestJS DI, repositories, and services. Any future entity-level lifecycle hook (e.g., `@BeforeInsert` doing non-trivial work beyond UUID/timestamps) would not run for factory-created rows. The `BaseEntity.@BeforeInsert` today only fills `id` and `createdAt`, which the DB defaults already handle; that's intentional and the factory `RETURNING` clause picks them up. If a future entity adds a hook that does meaningful work, the factory for that table must mirror the behavior. Document this in `apps/api/test/index.ts` as a header comment.
- **Error propagation:** factories let `pg` errors surface unchanged. They do not translate `23505` to `ConflictException`; that's the production repository's job. Tests that rely on the translated exception type must continue calling the service path (not the factory).
- **State lifecycle risks:** `TRUNCATE ... CASCADE` is destructive at the schema level. The cleanup helper only touches `identity` schema tables. Any future schema added to the DB (e.g., `book_club`) gets its own cleanup helper — no shared "truncate everything" function.
- **API surface parity:** factories produce row shapes that match what TypeORM produces (same column set, same types). The integration suite is the parity check; if TypeORM ever changes how it materializes a column (e.g., default coercion), the factory will diverge and the int-spec assertions will catch it. This is the intended contract.
- **Integration coverage:** the migration preserves every existing assertion. No behavior change is expected. Net effect: tests run slightly faster (one fewer bcrypt per setup when `plainPassword` is unused) and fail more locally when something breaks.
- **Build surface:** `tsconfig.app.json` gains one new exclude line. The production webpack build (via Nx) follows this config, so `__test-support__/` folders do not enter `apps/api/dist`. The two new test-only path aliases live only in `tsconfig.spec.json`, so production code that tries to write `import ... from '@module/identity/test-support'` fails to resolve at build time — a complementary guardrail to the exclude.
- **Unchanged invariants:** the production HTTP API, JWT payload shape, repositories' public methods (minus `BaseRepository.delete`), and module wiring all stay identical. dep-cruiser rules unchanged; existing module boundaries unchanged. The `__test-support__/` folders are not module entry points and do not appear in the existing dep-cruiser configuration.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Factory row types drift from entity columns (e.g., a new column is added and forgotten in the factory). | The factory's `RETURNING *` returns the live column set; the integration suite asserts against rows that came back from the DB. A divergence breaks the suite. Also: when a migration adds a column, the PR author already touches related tests — the failure surfaces immediately. |
| `TRUNCATE ... CASCADE` masks a foreign-key bug that `DELETE WHERE email LIKE ...` would have surfaced. | `CASCADE` is scoped to the `identity` schema only. The schema currently has well-defined FK relationships; if a future FK is added that should *not* cascade, the cleanup helper will need explicit per-table truncates. Flag this in a TODO comment in `cleanup.ts`. |
| Minting JWTs in tests via `JwtService.sign` drifts from production payload shape. | Read the exact payload structure from `auth.service.ts` at migration time; document in a constant in the test file (e.g., `const TEST_JWT_PAYLOAD = (user) => ({ sub: user.id, email: user.email })`). A guard-protected endpoint failing on a minted token would surface this in the e2e suite. |
| Shared `pg.Pool` is left open between suites and exhausts connections. | `closeTestPool()` invoked from each spec's `afterAll`. Pool config caps `max` at a small value (e.g., 4) so even leaked pools don't exhaust Postgres. |
| `BaseRepository.delete` removal misses a caller. | Unit 6 explicitly re-greps before deletion; CI build catches any compile error. |
| Production code accidentally imports from `__test-support__/` (relative path), bypassing the missing alias. | Passive only: the `tsconfig.app.json` exclude keeps test-support out of the build *as a root*, but a relative import from prod still pulls it in by reference. The path-alias guardrail catches alias-style imports but not relative ones. **Future tightening:** if this ever happens in practice, add a dep-cruiser rule forbidding any non-test file from importing `**/__test-support__/**`. Recorded here so it's a known accepted gap, not an oversight. |

## Documentation / Operational Notes

- Update `CLAUDE.md` (project root) "Testing Patterns" section to describe the `__test-support__/` convention and the factory API briefly. Mention that domain modules own their factories alongside their entities and migrations.
- Add a short note to `docs/MODULAR-PRINCIPLES.md` (or wherever module conventions are codified) so future domains follow the same `__test-support__/` pattern.
- No ADR required — this is a test-infrastructure choice within existing module boundaries. The co-location decision and the `tsconfig` isolation mechanism are captured here in this plan.
- No rollout, monitoring, or migration impact: changes are confined to the test suite plus one method removal that has zero production callers.

## Sources & References

- Existing test patterns:
  - `apps/api/src/module/identity/core/__tests__/auth.service.int-spec.ts:33-105` (current schema-setup, cleanup, and seeding patterns)
  - `apps/api/src/module/identity/__tests__/avatar.e2e-spec.ts:93-188` (e2e seeding pattern)
- Production code touched:
  - `apps/api/src/module/shared/typeorm/base.repository.ts:53-61` (`delete` method removal target)
  - `apps/api/src/module/shared/typeorm/base.entity.ts` (UUID/timestamp defaults the factories rely on)
- Build / test config touched:
  - `apps/api/tsconfig.app.json` (new exclude line for `__test-support__/`)
  - `apps/api/tsconfig.spec.json` (override `exclude`, add two test-only path aliases)
  - `apps/api/jest.config.js` (matching `moduleNameMapper` entries for the aliases)
- ADRs:
  - `docs/adr/0005-application-side-uuid-generation.md` (rationale for DB-side UUID default the factories use)
  - `docs/adr/0006-module-shared-and-path-aliases.md` (dep boundaries; factories live outside `src/` to avoid this surface)
- Project rules:
  - `docs/STATE-ISOLATION.md` (schema-per-domain rule; factories quote `identity."..."`)
