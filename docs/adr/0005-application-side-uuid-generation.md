# 0005. Generate entity identity fields in the application layer

Date: 2026-04-21
Status: Accepted

## Context

With the introduction of the persistence refactor (plan `2026-04-21-001-refactor-persistence-layer-plan.md`), a `BaseEntity` was added under `apps/api/src/infra/typeorm/` to provide shared columns (`id`, `createdAt`, `updatedAt`) to all domain entities. The initial implementation used TypeORM's `@PrimaryGeneratedColumn('uuid')` (DB-generated UUID) together with `@CreateDateColumn()` and `@UpdateDateColumn()` (DB defaults plus TypeORM client-side population on save).

This decision needs to be revisited as more domain modules (clubs, reading, meetings) are added. Those modules will create aggregates that span multiple entities in a single transaction (e.g., creating a Club with an initial Membership and Invitation). Database-generated IDs force a specific transaction shape: save the parent, read back the ID, then save the children. This limits our ability to build complete aggregates in memory and persist them atomically, and it makes it harder to emit domain events with identity information before the DB round-trip completes.

Once we decide to generate `id` in the application layer, it is natural to ask the same question about `createdAt` and `updatedAt`: should timestamps move to the app layer too? We answer that here as well so the identity-field strategy is recorded in one place.

## Decision Drivers

- Aggregate construction: domain modules should be able to build full object graphs in memory before any DB call
- Event readiness: application code should be able to reference a new entity's ID before persistence (for logging, domain events, correlation IDs)
- Testability: fixtures and assertions are easier when entities have a stable ID from construction, not post-save
- Portability: UUID generation should not be tied to a specific database engine
- Safety net: raw SQL inserts (migrations, seed scripts, admin tooling) should still produce valid rows
- Future option: the approach should leave room to adopt UUIDv7 (timestamp-prefixed, sortable) later without a DB migration

## Options Considered

### Option A: Application-side UUID via `@BeforeInsert` hook on `BaseEntity`

`BaseEntity` declares `id` with `@PrimaryColumn({ type: 'uuid' })` and a `@BeforeInsert` lifecycle method that calls `crypto.randomUUID()` when `id` is empty. The DB column keeps `DEFAULT gen_random_uuid()` as a safety net for raw inserts that bypass the ORM.

- Pro: IDs exist on entity instances immediately after construction -- can be used in logs, events, and cross-entity references before any DB call
- Pro: Aggregates can be fully built in memory and persisted in a single transaction, even when child rows reference the parent's ID
- Pro: `crypto.randomUUID()` is a standard Node.js built-in, no extra dependency
- Pro: Portable across databases -- moving off PostgreSQL later would not require an ID strategy change
- Pro: Leaves a clean path to adopt UUIDv7 in the future by swapping the generation function, no DB migration needed
- Pro: DB-level default remains as defense in depth -- raw SQL inserts still get a valid ID
- Con: Relies on the hook firing; bypassing TypeORM (e.g., `queryRunner.query()`) falls back to the DB default, which produces a v4 UUID instead of whatever app-level strategy we use
- Con: Two places generate UUIDs (app and DB) -- they must both be v4-compatible to behave consistently

### Option B: Keep database-generated UUIDs via `@PrimaryGeneratedColumn('uuid')`

TypeORM tells PostgreSQL to fill the `id` column on insert via `gen_random_uuid()`.

- Pro: Single source of truth -- DB always generates the ID, no risk of the app forgetting to
- Pro: Slightly simpler `BaseEntity` (no hook, no `crypto` import)
- Con: The entity's `id` property is `undefined` until after `save()` completes, forcing the app to wait on the DB before referencing the ID
- Con: Multi-entity transactions that need parent-child references require sequential saves with intermediate round-trips
- Con: Tied to PostgreSQL's `gen_random_uuid()` function -- portability across databases is weaker
- Con: No path to UUIDv7 without a DB migration and function swap

### Option C: Generate UUIDs only in the repository layer

The `BaseRepository.create()` method assigns `id` before calling `repository.save()`. `BaseEntity` stays as `@PrimaryColumn` with no hook.

- Pro: Centralizes ID generation in one well-known place
- Con: Entities constructed outside the repository (e.g., in a service building an aggregate, or in tests) have no ID until the repository touches them -- defeats the main benefit of app-side generation
- Con: Raw `manager.save(entity)` inside a transaction (which `AuthService.resetPassword` already uses) bypasses the repository and falls back to the DB default, creating inconsistent behavior
- Con: Doesn't compose with aggregate construction patterns

## Decision

**Option A** -- application-side identity fields via a shared `@BeforeInsert` hook on `BaseEntity`.

`BaseEntity` now uses `@PrimaryColumn({ type: 'uuid' })` plus a `@BeforeInsert` hook that assigns both `id` and `createdAt` when they are not already set:

- `id` is generated via `randomUUID()` from `node:crypto`
- `createdAt` is set to `new Date()`

Both assignments are guarded by `if (!this.field)` checks, so callers that provide their own values (tests, fixtures, future data-import flows) are not overwritten.

The existing migrations keep `DEFAULT gen_random_uuid()` and `DEFAULT now()` on these columns, so raw SQL inserts (migrations, seeds, admin scripts) still produce valid rows.

### Why `updatedAt` stays with `@UpdateDateColumn`

Update tracking is left to TypeORM's `@UpdateDateColumn`, which sets the field client-side on every ORM `save()` / `update()`. A DB trigger would extend coverage to raw SQL updates, but the cost (one trigger per table, maintained in migrations) outweighs the benefit at this scale. The one path in this codebase that bypasses repositories -- `AuthService.resetPassword` using `manager.update()` -- still goes through TypeORM's entity manager, which applies the `@UpdateDateColumn` hook. The practical rule becomes: **generation-at-creation is an application concern; update tracking is an ORM concern**.

## Consequences

### Positive

- Domain services can construct complete aggregates in memory before persisting them atomically
- Logs, metrics, and domain events can reference a new entity's ID before the DB round-trip completes
- Test fixtures can use real-shaped IDs from entity construction without round-tripping through the DB
- The ID strategy is portable across databases -- future migrations to other engines do not require rethinking primary keys
- UUIDv7 adoption is a one-line change (swap `randomUUID()` for a v7 generator) with no DB migration
- DB-level default acts as a safety net for any insert path that bypasses the ORM

### Negative / Trade-offs

- Two generation sources exist for `id` and `createdAt` (app hook + DB default). Both are v4-compatible / `now()`-compatible today, but a future switch (e.g., UUIDv7) in the app must either accept that bypass-the-ORM inserts still use the DB default, or update the DB default to match
- `createdAt` now comes from the app clock rather than the DB clock. Clock skew across NTP-synced hosts is typically under 10ms, which is acceptable for this application's use of timestamps (audit, display, ordering within a user's perception). Systems that need strict cross-node ordering should not rely on wall-clock timestamps regardless of where they are generated
- `BaseEntity` now depends on `node:crypto`. This is a built-in Node module, so the cost is negligible, but it slightly broadens the base class's surface
- Entities not extending `BaseEntity` (e.g., `PasswordResetTokenEntity`, which stays standalone due to lacking `updatedAt`) do not get app-side generation unless they opt in explicitly. Today this is acceptable because that entity is never referenced by ID before persistence, but new entities that skip `BaseEntity` need to consider the same question

### Neutral / Watch

- If performance profiling ever shows UUIDv4 index fragmentation is a real cost on large tables, revisit UUIDv7 before adding workarounds
- If the app introduces a seeding or fixture system that uses raw SQL, document that those paths rely on the DB default and produce v4 IDs regardless of the app strategy
- If multi-DB support is ever needed (e.g., extracting a bounded context to a different engine), the app-side strategy already works -- the DB default will need to be rewritten per engine
