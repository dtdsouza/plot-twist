---
title: "refactor: Restructure API persistence layer with base classes and centralized TypeORM config"
type: refactor
status: completed
date: 2026-04-21
---

# Restructure API Persistence Layer

## Overview

Extract TypeORM configuration into a dedicated `infra/typeorm/` module, introduce a `BaseEntity` and `BaseRepository` with minimal CRUD API, centralize DataSource config sharing between NestJS and CLI migrations, and refactor the identity module to use domain-specific repositories.

## Problem Frame

The persistence layer currently has:
- TypeORM `forRootAsync()` configured inline in `app.module.ts` (not reusable)
- `data-source.ts` duplicates DB connection config separately from the NestJS config system
- No base entity -- each entity redeclares `id`, `createdAt`, `updatedAt`
- Services inject raw `Repository<T>` from TypeORM, exposing the full TypeORM API surface (QueryBuilder, raw queries, etc.) when only basic CRUD is needed
- No domain-specific repository layer to encapsulate query logic

As more domains are added (clubs, reading, meetings), these patterns will compound into inconsistency and unnecessary coupling to TypeORM internals.

## Requirements Trace

- R1. Create `infra/typeorm/` with `TypeormPersistenceModule` wrapping `TypeOrmModule.forRootAsync()`
- R2. Create abstract `BaseEntity` with shared columns (`id`, `createdAt`, `updatedAt`)
- R3. Create abstract `BaseRepository<T>` exposing only minimal CRUD (`findOne`, `findMany`, `create`, `update`, `delete`)
- R4. Create `persistence/` module at same level as `infra/` that provides the TypeORM connection and shared DataSource config
- R5. Eliminate DataSource config duplication between `app.module.ts` and `data-source.ts`
- R6. Per-domain modules keep their own `forFeature()` and repository registration (no central repository coupling)
- R7. Refactor identity module to use domain repositories extending `BaseRepository`

## Scope Boundaries

- NOT changing database schema or creating new migrations (BaseEntity produces identical columns)
- NOT adding QueryBuilder or advanced TypeORM features to base repository
- NOT centralizing domain repository registration (each module keeps its own)
- NOT touching the `infra/config/` or `infra/mail/` modules
- NOT refactoring the `resetPassword` transaction (multi-entity transactions stay in service layer)

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/module/app/app.module.ts:16-33` -- current `TypeOrmModule.forRootAsync()` inline config
- `apps/api/src/data-source.ts` -- CLI DataSource with duplicated env parsing
- `apps/api/src/infra/config/segment/database.config.ts` -- `IDatabaseConfig` interface and `registerAs` factory
- `apps/api/src/infra/config/env.schema.ts` -- Zod schema used by both config module and data-source.ts
- `apps/api/src/module/identity/persistence/entity/user.entity.ts` -- entity with `id`, `createdAt`, `updatedAt`
- `apps/api/src/module/identity/persistence/entity/password-reset-token.entity.ts` -- entity with `id`, `createdAt` only (no `updatedAt`)
- `apps/api/src/module/identity/core/auth.service.ts` -- uses `@InjectRepository()` with raw `Repository<T>`
- `apps/api/src/module/identity/identity.module.ts` -- `TypeOrmModule.forFeature()` registration

### Existing Patterns to Follow

- Dynamic module pattern: `MailModule` in `infra/mail/` with barrel `index.ts` export
- Config segment pattern: `registerAs()` with typed config interface (e.g., `database.config.ts`)
- Barrel exports: all `infra/` subfolders use `index.ts` for clean imports
- Test patterns: `__tests__/` folders colocated with source, mock-based unit tests

## Key Technical Decisions

- **`BaseEntity` does NOT apply to `PasswordResetTokenEntity`**: That entity has `createdAt` but no `updatedAt` -- it is semantically immutable (created and deleted, never updated). Forcing `updatedAt` would require a new migration and contradict the entity's lifecycle. It keeps `@PrimaryGeneratedColumn('uuid')` and `@CreateDateColumn()` directly.

- **Spread-copy on every repository return**: `BaseRepository` methods return `{ ...entity }` to enforce immutability (per coding-style.md) and detach from TypeORM's change-tracking proxy. All mutations go through explicit repository calls.

- **`findOne` returns `null`, not throws**: Callers (services) decide whether absence is an error. This matches the existing `auth.service.ts` pattern.

- **`NotFoundException` in `update`/`delete`**: These operations require the entity to exist. Since the API is HTTP-only, using `@nestjs/common` exceptions directly is acceptable.

- **`protected readonly repository` on `BaseRepository`**: Domain repositories can access raw TypeORM `Repository<T>` for advanced one-off queries (e.g., `MoreThan` in `PasswordResetTokenRepository`) while the public base API stays minimal.

- **Multi-entity transactions stay in services**: The `resetPassword` transaction spans user update + token delete. This is a service-layer orchestration concern, not a single-entity repository concern. `DataSource` injection stays in `AuthService`.

- **DataSource config sharing via pure function**: `buildDataSourceOptions()` is a standalone function (no NestJS DI) so `data-source.ts` (CLI context) can call it. The NestJS path continues using `ConfigService` for the validated config, both backed by the same `envSchema`.

## Open Questions

### Resolved During Planning

- **Should `BaseEntity` shadow TypeORM's `BaseEntity`?** Yes -- the project uses the repository pattern exclusively, never the active-record pattern. The name collision is unlikely in practice. If needed, an import alias resolves it.

- **How to handle `IFindManyOptions` typing?** Define a project-specific interface wrapping `FindOptionsWhere<T>`, `take`, `skip`, `order`. Keeps the base repository API clean without leaking TypeORM's full `FindManyOptions`.

### Deferred to Implementation

- **Exact import path style**: Whether relative paths or tsconfig path aliases are used -- follow whatever pattern the existing `infra/mail/` and `infra/config/` imports use.

## Implementation Units

- [ ] **Unit 1: Base Entity**

  **Goal:** Create abstract base entity with shared columns.

  **Requirements:** R2

  **Dependencies:** None

  **Files:**
  - Create: `apps/api/src/infra/typeorm/base.entity.ts`
  - Test: `apps/api/src/infra/typeorm/__tests__/base.entity.spec.ts`

  **Approach:**
  - Abstract class with `@PrimaryGeneratedColumn('uuid')`, `@CreateDateColumn()`, `@UpdateDateColumn()`
  - Properties are `readonly` with `!` non-null assertion (TypeORM populates post-construction)
  - No `@Entity()` decorator on the base -- only concrete subclasses carry it

  **Patterns to follow:**
  - Existing entity column style in `user.entity.ts`

  **Test scenarios:**
  - Happy path: a concrete subclass that extends `BaseEntity` has `id`, `createdAt`, `updatedAt` in TypeORM's `getMetadataArgsStorage()` column metadata
  - Happy path: the base class itself does NOT appear in entity metadata storage (no `@Entity()` decorator)

  **Verification:**
  - `pnpm nx typecheck api` passes
  - Unit test passes

---

- [ ] **Unit 2: Base Repository**

  **Goal:** Create abstract repository wrapping TypeORM's `Repository<T>` with minimal CRUD.

  **Requirements:** R3

  **Dependencies:** Unit 1

  **Files:**
  - Create: `apps/api/src/infra/typeorm/base.repository.ts`
  - Test: `apps/api/src/infra/typeorm/__tests__/base.repository.spec.ts`

  **Approach:**
  - Generic `BaseRepository<T extends BaseEntity>` accepting `Repository<T>` in constructor
  - Five public methods: `findOne(where)`, `findMany(options?)`, `create(data)`, `update(id, data)`, `delete(id)`
  - Define `IFindManyOptions<T>` interface with `where`, `take`, `skip`, `order`
  - Spread-copy (`{ ...entity }`) on every return to enforce immutability
  - `findOne` returns `T | null`; `update`/`delete` throw `NotFoundException` if entity not found
  - `protected readonly repository` for subclass access to advanced TypeORM features

  **Patterns to follow:**
  - Immutability pattern from `coding-style.md` (never mutate, create new objects)
  - Error handling with NestJS exceptions per `coding-style.md`

  **Test scenarios:**
  - Happy path: `findOne` with matching entity returns a spread copy (not reference-equal to original)
  - Happy path: `findOne` with no match returns `null`
  - Happy path: `findMany` returns array of spread copies
  - Edge case: `findMany` with no results returns empty array
  - Happy path: `create` calls `repository.create()` then `repository.save()`, returns spread copy
  - Happy path: `update` finds entity, merges data, saves, returns spread copy
  - Error path: `update` with non-existent id throws `NotFoundException`
  - Happy path: `delete` finds entity and calls `repository.remove()`
  - Error path: `delete` with non-existent id throws `NotFoundException`

  **Verification:**
  - All tests pass with 100% coverage on `base.repository.ts`
  - `pnpm nx typecheck api` passes

---

- [ ] **Unit 3: TypeORM Persistence Module**

  **Goal:** Extract `TypeOrmModule.forRootAsync()` from `app.module.ts` into a reusable module.

  **Requirements:** R1

  **Dependencies:** None (parallel with Units 1-2)

  **Files:**
  - Create: `apps/api/src/infra/typeorm/typeorm-persistence.module.ts`
  - Create: `apps/api/src/infra/typeorm/index.ts` (barrel export for entire `typeorm/` folder)

  **Approach:**
  - Move the `TypeOrmModule.forRootAsync()` block from `app.module.ts:16-33` into a new `TypeormPersistenceModule`
  - Inject `ConfigService`, read `IDatabaseConfig` from `'database'` token
  - Keep `autoLoadEntities: true`
  - Barrel export: `BaseEntity`, `BaseRepository`, `IFindManyOptions`, `TypeormPersistenceModule`

  **Patterns to follow:**
  - `MailModule` pattern in `infra/mail/` (module + barrel index)
  - Config injection pattern from current `app.module.ts`

  **Test scenarios:**
  - Happy path: `Test.createTestingModule` compiles with `TypeormPersistenceModule` imported and a mocked `ConfigService` providing database config

  **Verification:**
  - Module compiles without errors
  - `pnpm nx typecheck api` passes

---

- [ ] **Unit 4: Persistence Module + DataSource Config Sharing**

  **Goal:** Create the `persistence/` module and eliminate DataSource config duplication.

  **Requirements:** R4, R5

  **Dependencies:** Unit 3

  **Files:**
  - Create: `apps/api/src/persistence/data-source.options.ts`
  - Create: `apps/api/src/persistence/persistence.module.ts`
  - Create: `apps/api/src/persistence/index.ts`
  - Modify: `apps/api/src/data-source.ts`
  - Test: `apps/api/src/persistence/__tests__/data-source.options.spec.ts`

  **Approach:**
  - `buildDataSourceOptions(overrides?)` -- pure function using `envSchema.parse(process.env)`, returns `DataSourceOptions` merged with overrides
  - `PersistenceModule` imports and re-exports `TypeormPersistenceModule`
  - `data-source.ts` calls `buildDataSourceOptions({ entities, migrations, subscribers })` instead of inline config
  - Entity and migration lists stay in `data-source.ts` (CLI DataSource needs explicit paths, no `autoLoadEntities`)

  **Patterns to follow:**
  - Current `data-source.ts` env parsing via `envSchema`
  - Barrel export pattern from other `infra/` modules

  **Test scenarios:**
  - Happy path: `buildDataSourceOptions()` returns correct `DataSourceOptions` shape with all required fields from env vars
  - Happy path: `buildDataSourceOptions({ logging: false })` merges overrides correctly
  - Error path: missing required env vars causes Zod validation error

  **Verification:**
  - `data-source.ts` uses `buildDataSourceOptions` with no duplicated config
  - CLI migrations still work: `pnpm typeorm migration:show -d ./src/data-source.ts`
  - `pnpm nx typecheck api` passes

---

- [ ] **Unit 5: Domain Repositories (Identity Module)**

  **Goal:** Create `UserRepository` and `PasswordResetTokenRepository` extending `BaseRepository`.

  **Requirements:** R7

  **Dependencies:** Units 1, 2

  **Files:**
  - Create: `apps/api/src/module/identity/persistence/repository/user.repository.ts`
  - Create: `apps/api/src/module/identity/persistence/repository/password-reset-token.repository.ts`
  - Test: `apps/api/src/module/identity/persistence/repository/__tests__/user.repository.spec.ts`
  - Test: `apps/api/src/module/identity/persistence/repository/__tests__/password-reset-token.repository.spec.ts`

  **Approach:**
  - `UserRepository extends BaseRepository<UserEntity>` -- no custom methods needed initially (basic CRUD covers current usage)
  - `PasswordResetTokenRepository extends BaseRepository<PasswordResetTokenEntity>` -- add domain-specific methods:
    - `findValidByTokenHash(tokenHash: string)` -- wraps `findOne` with `MoreThan(new Date())` on `expiresAt`
    - `deleteAllForUser(userId: string)` -- wraps `repository.delete({ userId })`
  - Both injectable via `@Injectable()`, receive `@InjectRepository(Entity)` in constructor

  **Patterns to follow:**
  - NestJS injectable service pattern
  - `@InjectRepository()` decorator pattern from current `auth.service.ts`

  **Test scenarios:**
  - Happy path: `UserRepository` delegates `findOne`, `create`, `findMany` to `BaseRepository` correctly
  - Happy path: `PasswordResetTokenRepository.findValidByTokenHash` finds valid non-expired token
  - Happy path: `PasswordResetTokenRepository.findValidByTokenHash` returns `null` for expired/missing token
  - Happy path: `PasswordResetTokenRepository.deleteAllForUser` calls `repository.delete` with correct userId

  **Verification:**
  - Unit tests pass
  - `pnpm nx typecheck api` passes

---

- [ ] **Unit 6: Migrate UserEntity to BaseEntity**

  **Goal:** Extend `UserEntity` from `BaseEntity`, remove duplicated column declarations.

  **Requirements:** R2

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `apps/api/src/module/identity/persistence/entity/user.entity.ts`

  **Approach:**
  - `UserEntity extends BaseEntity` -- remove `id`, `createdAt`, `updatedAt` declarations
  - Keep `@Entity({ schema: 'identity', name: 'user' })` decorator
  - Remove `PrimaryGeneratedColumn`, `CreateDateColumn`, `UpdateDateColumn` imports if no longer needed
  - Do NOT modify `PasswordResetTokenEntity` (no `updatedAt`, stays standalone)

  **Patterns to follow:**
  - Existing entity decorator style

  **Test scenarios:**
  - Happy path: `UserEntity` still has `id`, `createdAt`, `updatedAt` metadata via inheritance
  - Integration: existing auth service tests still pass (no behavioral change)

  **Verification:**
  - No schema drift: `pnpm nx typecheck api` passes, no migration diff needed
  - Existing tests pass unchanged

---

- [ ] **Unit 7: Wire Everything Together**

  **Goal:** Update `AppModule`, `IdentityModule`, and `AuthService` to use the new modules and repositories.

  **Requirements:** R1, R4, R6, R7

  **Dependencies:** Units 3, 4, 5, 6

  **Files:**
  - Modify: `apps/api/src/module/app/app.module.ts`
  - Modify: `apps/api/src/module/identity/identity.module.ts`
  - Modify: `apps/api/src/module/identity/core/auth.service.ts`

  **Approach:**
  - `app.module.ts`: Replace inline `TypeOrmModule.forRootAsync()` with `PersistenceModule` import. Remove `ConfigService` and `IDatabaseConfig` imports.
  - `identity.module.ts`: Add `UserRepository` and `PasswordResetTokenRepository` as providers. Keep `TypeOrmModule.forFeature()` (still needed for `@InjectRepository` tokens).
  - `auth.service.ts`:
    - Replace `@InjectRepository(UserEntity) userRepository: Repository<UserEntity>` with `UserRepository`
    - Replace `@InjectRepository(PasswordResetTokenEntity) tokenRepository: ...` with `PasswordResetTokenRepository`
    - Adapt method calls to `BaseRepository` API: `findOne({ where: { email } })` becomes `findOne({ email })`, `create()` + `save()` becomes single `create()` call
    - Keep `DataSource` injection for the `resetPassword` transaction (multi-entity, stays in service)
    - `tokenRepository.delete({ userId })` becomes `tokenRepository.deleteAllForUser(userId)`
    - `tokenRepository.findOne({ where: { tokenHash, expiresAt: MoreThan(...) } })` becomes `tokenRepository.findValidByTokenHash(tokenHash)`

  **Patterns to follow:**
  - Module import pattern from current `app.module.ts`
  - Constructor injection pattern from current `auth.service.ts`

  **Test scenarios:**
  - Integration: `register` creates user via `UserRepository.create`
  - Integration: `login` finds user via `UserRepository.findOne`
  - Integration: `forgotPassword` creates token via `PasswordResetTokenRepository.create`, deletes old tokens via `deleteAllForUser`
  - Integration: `resetPassword` finds valid token via `findValidByTokenHash`, transaction still works with `DataSource`
  - Error path: all existing error scenarios (duplicate email, invalid credentials, expired token) still behave identically

  **Verification:**
  - All existing tests pass (updated for new mock shapes)
  - `pnpm nx typecheck api` passes
  - `pnpm nx test api` passes

---

- [ ] **Unit 8: Update Existing Tests**

  **Goal:** Update unit and integration test mocks to use domain repositories instead of raw `Repository<T>`.

  **Requirements:** R7

  **Dependencies:** Unit 7

  **Files:**
  - Modify: `apps/api/src/module/identity/core/__tests__/auth.service.spec.ts`
  - Modify: `apps/api/src/module/identity/core/__tests__/auth.service.int-spec.ts` (if exists)
  - Modify: `apps/api/jest.config.js` (update `collectCoverageFrom` to include new dirs)

  **Approach:**
  - Replace `getRepositoryToken(UserEntity)` mocks with `UserRepository` mocks
  - Mock shape changes: `{ findOne, create, save, delete }` becomes `{ findOne, findMany, create, update, delete }` plus domain methods
  - `DataSource` mock stays unchanged
  - Add `src/infra/typeorm/**/*.ts` and `src/persistence/**/*.ts` to `collectCoverageFrom`

  **Test scenarios:**
  - All existing test scenarios pass with updated mock shapes
  - Coverage includes new `infra/typeorm/` and `persistence/` directories

  **Verification:**
  - `pnpm nx test api` passes with 80%+ coverage
  - No test is skipped or broken

## System-Wide Impact

- **Interaction graph:** `AppModule` -> `PersistenceModule` -> `TypeormPersistenceModule` -> `TypeOrmModule.forRootAsync()`. Domain modules continue importing `TypeOrmModule.forFeature()` independently.
- **Error propagation:** `BaseRepository` throws `NotFoundException` for missing entities in `update`/`delete`. Services catch or propagate as needed. No change to HTTP exception filter behavior.
- **State lifecycle risks:** Spread-copy detaches entities from TypeORM's change tracker. This is intentional -- all mutations go through explicit repository calls. The `resetPassword` transaction bypasses the repository (uses `manager` directly), which is acceptable for multi-entity atomicity.
- **API surface parity:** No external API changes. All HTTP endpoints behave identically.
- **Unchanged invariants:** Schema isolation rules (STATE-ISOLATION.md) are preserved. Each domain module continues to own its entities, migrations, and `forFeature()` registration.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Spread-copy breaks TypeORM entity class methods or prototype chain | Entities are POJOs with decorators, no instance methods. Verify in tests. If future entities need methods, switch to `Object.assign(Object.create(Object.getPrototypeOf(entity)), entity)` |
| `BaseEntity` name shadows TypeORM's active-record `BaseEntity` | Project never uses active-record pattern. Import alias resolves if ever needed |
| `module: nodenext` import path resolution | Follow existing patterns in the codebase (no explicit `.js` extensions in source) |
| Existing migrations expect exact column layout | `BaseEntity` produces identical decorators -- no migration needed. Verify with typecheck |
| Coverage config misses new directories | Explicitly update `collectCoverageFrom` in jest.config.js |

## Sources & References

- Related code: `apps/api/src/module/app/app.module.ts`, `apps/api/src/data-source.ts`
- Architecture docs: `docs/STATE-ISOLATION.md`, `docs/MODULAR-PRINCIPLES.md`
