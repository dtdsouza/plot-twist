---
title: "refactor: Consolidate shared modules under module/shared and adopt @module/* path aliases"
type: refactor
status: active
date: 2026-05-04
---

# Consolidate Shared Modules Under `module/shared` and Adopt `@module/*` Path Aliases

## Overview

Move `infra/` and `persistence/` from the top of `apps/api/src/` into a new `module/shared/` namespace alongside the domain modules, introduce TypeScript path aliases (`@module/<domain>`, `@module/shared/<concern>`) for all cross-module imports, and extend dependency-cruiser governance so domain modules can only depend on `module/shared/*` (and their own files) while `module/shared/*` cannot depend on any domain.

## Problem Frame

The API today has three sibling top-level concerns inside `apps/api/src/`:

- `module/` — domain modules (`app`, `identity`)
- `infra/` — cross-cutting infrastructure (`config`, `mail`, `typeorm`)
- `persistence/` — app-level TypeORM/DataSource wiring

This split has three downsides:

1. **Inconsistent home for "support" code.** Cross-cutting concerns live outside `module/`, so the rule "everything that participates in the app composition is a module" has an exception that grows fuzzier as more shared concerns appear.
2. **Cross-module imports are brittle relative paths.** `auth.service.ts` reaches `'../../../infra/mail/...'` and `'../../infra/config'`; these break the moment a file moves and obscure the intent ("this is shared infrastructure, not domain code").
3. **Governance can only express "no sibling domain imports".** The current `.dependency-cruiser.cjs` rule prevents `module/identity/` from importing `module/<other>/`, but it cannot express "domain modules may import from `shared/*` only" because `shared/` does not yet exist as a first-class module location. There is also no cheap signal at the editor layer when a developer reaches into another module's internals (no public-API barrel).

This is not a behavior change — it is a structural refactor that turns implicit conventions into explicit, machine-checkable boundaries, and lays the path described in `docs/MODULAR-PRINCIPLES.md` toward future `libs/{scope}/{type}-{name}` extraction.

## Requirements Trace

- R1. Move `apps/api/src/infra/{config,mail,typeorm}` into `apps/api/src/module/shared/{config,mail,typeorm}` with no behavior or schema changes.
- R2. Move `apps/api/src/persistence/` into `apps/api/src/module/shared/persistence/` (kept distinct from `module/shared/typeorm/` per ADR-aligned separation between reusable primitives and app-level wiring).
- R3. Introduce TypeScript path aliases `@module/<domain>` and `@module/shared/<concern>` in `tsconfig.app.json`, `tsconfig.spec.json`, and `tsconfig.cli.json`, wired through webpack, ts-jest, and ts-node so build, test, and TypeORM CLI all resolve them identically.
- R4. Add a public-API barrel `index.ts` to every domain and shared module so consumers import only the surface that module deliberately exposes.
- R5. Migrate every cross-module import in `apps/api/src/` to use the new aliases. Within-module imports remain relative.
- R6. Extend `.dependency-cruiser.cjs` to:
  - allow `module/shared/*` as a universally-allowed destination,
  - keep the existing "no sibling domain imports" rule,
  - forbid `module/shared/*` from importing any domain module,
  - keep `module/app/` as the orchestrator exception (may import any module).
- R7. Update repo docs (`CLAUDE.md`, `docs/MODULAR-PRINCIPLES.md` where it references the old layout) to reflect the new structure.
- R8. Preserve all existing test suites (`spec`, `int-spec`, `e2e-spec`) and the `lint:arch` Nx target — they must pass before and after each unit.

## Scope Boundaries

- **Not** changing any database schema, entity definition, or migration. The `identity` schema and its tables are untouched.
- **Not** introducing `libs/` or splitting the API into Nx libraries. That migration remains future work as described in `MODULAR-PRINCIPLES.md`.
- **Not** changing public HTTP routes, DTOs, response shapes, JWT contract, or email behavior.
- **Not** rewriting `BaseEntity` / `BaseRepository` semantics — only their location and how they're imported.
- **Not** switching governance from dependency-cruiser to ESLint. ADR-0002 chose dependency-cruiser deliberately; this plan extends that choice rather than replacing it. (The user's "ESLint" framing is treated as "lint-style governance", not a tool switch.)
- **Not** consolidating `module/shared/typeorm/` and `module/shared/persistence/` (confirmed during planning — keep two).
- **Not** publishing any of these aliases as workspace packages — `@module/*` is an in-app TS alias only, not an npm scope.

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/infra/config/` — `ConfigModule`, `envSchema`, `env.type.ts`, segments (`app`, `database`, `jwt`, `mail`), barrel `index.ts` already in place.
- `apps/api/src/infra/mail/` — `MailModule`, `ResendEmailService`, `email-service.interface.ts`, barrel `index.ts` already in place.
- `apps/api/src/infra/typeorm/` — `BaseEntity`, `BaseRepository`, `TypeormPersistenceModule`, barrel `index.ts` already in place.
- `apps/api/src/persistence/` — `PersistenceModule` (thin aggregator), `buildDataSourceOptions()` (CLI + runtime shared), barrel `index.ts` already in place.
- `apps/api/src/module/identity/` — full domain module: `core/`, `http/`, `persistence/`, `migrations/`, `identity.module.ts`. **No `index.ts` barrel today** — consumers reach into internals.
- `apps/api/src/module/app/app.module.ts` — orchestrator: imports `ConfigModule`, `PersistenceModule`, `IdentityModule`, `ThrottlerModule`. Eligible to use `@module/*` aliases.
- `apps/api/src/data-source.ts` — TypeORM CLI entrypoint. Imports `UserEntity`, `PasswordResetTokenEntity` directly today; will import via `@module/identity` after the migration. Migration glob `'src/module/identity/migrations/*.ts'` is a runtime glob, not a TS import — unaffected by aliases.
- `apps/api/main.ts` (Webpack) — Nx-generated webpack config; need to confirm `tsconfig-paths-webpack-plugin` is loaded or add it.
- `apps/api/jest.config.js` — `coverageCollectFrom` globs reference `src/infra/...` and `src/persistence/...` paths; must update.
- `apps/api/tsconfig.spec.json` — overrides `module: commonjs, moduleResolution: node`; ts-jest runs against this. Path aliases land here too.
- `apps/api/tsconfig.cli.json` — used by `typeorm-ts-node-commonjs`; aliases need `tsconfig-paths/register` at CLI invocation.
- `apps/api/.dependency-cruiser.cjs` — current `no-cross-module-imports` rule uses `$1` backreference; needs an additional clause to permit `shared` as destination and to prevent `shared → domain` imports.
- `apps/api/package.json` — `lint:arch`, `typeorm`, `migration:*` scripts that may need a `-r tsconfig-paths/register` flag.

### Institutional Learnings

- **ADR-0002 chose dependency-cruiser over `@nx/enforce-module-boundaries`** explicitly because the current size doesn't justify a project-per-module Nx structure. This plan stays inside that constraint — we extend the dep-cruiser rule, not replace it.
- **ADR-0001 / `infra/config` pattern**: env validation is centralized through Zod (`env.schema.ts`), and consumers go through `ConfigService.getOrThrow<T>(KEY)`. Keep this contract intact through the move.
- **Prior persistence refactor (`docs/plans/2026-04-21-001-refactor-persistence-layer-plan.md`, completed)** explicitly separated `infra/typeorm/` (reusable primitives: `BaseEntity`, `BaseRepository`, `TypeormPersistenceModule`) from `persistence/` (app-level wiring: `buildDataSourceOptions`, `PersistenceModule`). Keep that separation under `module/shared/`.
- **State isolation (`docs/STATE-ISOLATION.md`)**: every entity declares `@Entity({ schema: 'identity', name: 'user' })`. Aliases don't affect schema declarations, but `data-source.ts` still has to know about each schema's entities — handled via the new `@module/identity` barrel exporting entities.
- **Test setup memory**: integration/e2e tests rely on `CREATE SCHEMA IF NOT EXISTS identity` happening before TypeORM `synchronize`. That setup lives inside `__tests__/` and is unaffected by the file moves as long as relative paths inside `__tests__/` are kept consistent.

### External References

External research was not needed for this plan: every tool involved (TypeScript path aliases, ts-jest `pathsToModuleNameMapper`, `tsconfig-paths/register` for ts-node, dependency-cruiser tsConfig resolution) is already present in this repo or in widely-documented Nx defaults.

## Key Technical Decisions

- **Alias scheme: `@module/<domain>` and `@module/shared/<concern>`.** Single namespace, mirrors the directory layout one-to-one, minimizes the number of aliases the dep-cruiser regex has to reason about. Decided during planning interview.

- **Two shared persistence modules, not one.** `module/shared/typeorm/` keeps reusable primitives (BaseEntity / BaseRepository / `TypeormPersistenceModule`); `module/shared/persistence/` keeps app-level wiring (`buildDataSourceOptions`, `PersistenceModule`). This preserves the boundary the prior persistence refactor intentionally drew. Decided during planning interview.

- **Barrel-only public API on every module.** Each `module/<domain>/index.ts` exports the NestJS module + the *minimum* surface needed by consumers (entities for `data-source.ts`, the NestJS module class for `app.module.ts`). dependency-cruiser's graph resolution already follows re-exports, so the rule does not need a separate "no deep imports" clause — but the barrel makes the public API editorially obvious.

- **`@module/identity` exports entities, not just the NestJS module.** `data-source.ts` needs concrete entity classes for the TypeORM CLI; without exposing them via the barrel we'd force every CLI invocation to deep-import. Exposing entities is an accepted leak: they are CLI-shaped public API, not business logic.

- **Aliases are app-internal, not workspace-scoped.** They live in `apps/api/tsconfig.*.json`, not in the root `tsconfig.base.json`. This avoids colliding with the workspace's `customConditions: ["@org/source"]` mechanism and the future `libs/` namespace.

- **`module/app/` keeps its orchestrator exemption.** Today the dep-cruiser source pattern excludes `app/` via `(?!app/)`; the new rule keeps that exemption so the composition root remains the only module allowed to import any domain.

- **`module/shared/*` cannot import from any domain.** Adding this clause closes a real failure mode: a developer adding a feature could be tempted to put a domain-specific helper into `shared/` and create an inverted dependency. The rule makes that a static error.

- **Within-module imports stay relative.** Aliases would be churn with no benefit inside a single module; `core/auth.service.ts` keeps `../persistence/repository/...`. The rule of thumb: *aliases for crossing module boundaries, relatives for staying inside one*.

- **Sequencing: move first, then alias.** Doing the file move while imports are still relative produces one well-understood mechanical diff. Adding aliases after the move means each alias migration is purely an import-rewrite. Trying to do both at once doubles the diff per file and makes any failure harder to bisect.

## Open Questions

### Resolved During Planning

- *Which alias scheme?* — `@module/*` (single namespace, mirrors folders).
- *Collapse persistence into typeorm?* — No. Two shared modules preserved.
- *Switch governance to ESLint?* — No. ADR-0002 stands; extend dep-cruiser instead.
- *Should `data-source.ts` be moved into `module/shared/persistence/`?* — No. It is the CLI entrypoint and stays at `apps/api/src/data-source.ts`. It will import entities through `@module/identity` and call `buildDataSourceOptions` through `@module/shared/persistence`.

### Deferred to Implementation

- *Does Nx's default webpack config already wire `tsconfig-paths-webpack-plugin`?* — Confirmed at implementation time by running `pnpm nx build api` after Unit 3 and checking the bundle resolves aliases. If not, add the plugin to webpack config.
- *Is `tsconfig-paths/register` already loaded for `typeorm-ts-node-commonjs`?* — Verified by running `pnpm migration:show` after Unit 3. If aliases fail to resolve, add `-r tsconfig-paths/register` to the typeorm script in `apps/api/package.json`.
- *Should an ADR be created for this restructure?* — Recommended (a new ADR-0006 capturing the shared-module pattern + alias scheme), but treated as docs follow-up, not blocking.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Before:**

```
apps/api/src/
├── data-source.ts                     # imports identity entities directly via relative path
├── main.ts
├── infra/
│   ├── config/   (ConfigModule, envSchema, segments)
│   ├── mail/     (MailModule, ResendEmailService)
│   └── typeorm/  (BaseEntity, BaseRepository, TypeormPersistenceModule)
├── persistence/  (PersistenceModule, buildDataSourceOptions)
└── module/
    ├── app/      (orchestrator)
    └── identity/ (no public barrel)
```

**After:**

```
apps/api/src/
├── data-source.ts                     # imports via @module/identity, @module/shared/persistence
├── main.ts
└── module/
    ├── app/                           # orchestrator (unchanged)
    ├── identity/                      # + index.ts barrel (NestJS module + entities)
    └── shared/
        ├── config/                    # moved from infra/config
        ├── mail/                      # moved from infra/mail
        ├── typeorm/                   # moved from infra/typeorm
        └── persistence/               # moved from persistence/
```

**Allowed dependency directions:**

```
module/app/     ──► module/<any-domain>     (orchestrator: anything)
module/app/     ──► module/shared/*         (orchestrator: anything)
module/<domain> ──► module/shared/*         (allowed)
module/<domain> ──► module/<domain>         (own module only)
module/<domain> ──X module/<other-domain>   (forbidden — existing rule)
module/shared/* ──X module/<any-domain>     (forbidden — new rule)
```

**Import-shape sketch (cross-module only):**

```
// app.module.ts
import { ConfigModule } from '@module/shared/config'
import { PersistenceModule } from '@module/shared/persistence'
import { IdentityModule } from '@module/identity'

// identity.module.ts
import { type IJwtConfig } from '@module/shared/config'
import { MailModule } from '@module/shared/mail'

// data-source.ts
import { buildDataSourceOptions } from '@module/shared/persistence'
import { UserEntity, PasswordResetTokenEntity } from '@module/identity'

// auth.service.ts (within identity — relative paths preserved)
import { UserRepository } from '../persistence/repository/user.repository'
// but cross-module shared imports use the alias:
import { EMAIL_SERVICE, type IEmailService } from '@module/shared/mail'
import { MAIL_CONFIG_KEY, type IMailConfig } from '@module/shared/config'
```

## Implementation Units

- [ ] **Unit 1: Move `infra/*` and `persistence/` into `module/shared/`**

**Goal:** Physically relocate files into their new homes, fix relative imports inside moved files and inside consumers, and confirm the app still builds, tests, and runs migrations identically. No aliases yet.

**Requirements:** R1, R2, R8

**Dependencies:** None.

**Files:**

- Move: `apps/api/src/infra/config/**` → `apps/api/src/module/shared/config/**`
- Move: `apps/api/src/infra/mail/**` → `apps/api/src/module/shared/mail/**`
- Move: `apps/api/src/infra/typeorm/**` → `apps/api/src/module/shared/typeorm/**`
- Move: `apps/api/src/persistence/**` → `apps/api/src/module/shared/persistence/**`
- Modify: `apps/api/src/data-source.ts` (path to `buildDataSourceOptions` and to identity entities)
- Modify: `apps/api/src/module/app/app.module.ts` (paths to `ConfigModule`, `PersistenceModule`)
- Modify: `apps/api/src/module/identity/identity.module.ts` (paths to `IJwtConfig` type, `MailModule`)
- Modify: `apps/api/src/module/identity/core/auth.service.ts` (paths to `EMAIL_SERVICE`, `IEmailService`, `MAIL_CONFIG_KEY`, `IMailConfig`)
- Modify: `apps/api/src/module/shared/typeorm/typeorm-persistence.module.ts` (relative path to `../config/segment/database.config` — now a sibling under `shared/`)
- Modify: `apps/api/src/module/shared/persistence/data-source.options.ts` (relative paths to `../config/env.schema` and `../config/segment/database.config`)
- Modify: `apps/api/src/module/shared/persistence/persistence.module.ts` (relative path to `../typeorm`)
- Modify: `apps/api/jest.config.js` (`collectCoverageFrom` globs: drop `src/infra/**` and `src/persistence/**`, add `src/module/shared/**`)
- Modify: `apps/api/.dependency-cruiser.cjs` (interim: keep current rule working — confirmed not to break since `shared` isn't a domain yet, but will be re-evaluated in Unit 5)
- Delete: `apps/api/src/infra/` (empty after move)
- Delete: `apps/api/src/persistence/` (empty after move)

**Approach:**

- Use `git mv` to preserve history.
- For each moved file, recompute relative imports against its new location (e.g., `data-source.options.ts` was at `src/persistence/`, now at `src/module/shared/persistence/`, so `../infra/config/env.schema` becomes `../config/env.schema`).
- Sweep all consumers of `infra/*` and `persistence/*` with grep — there are ~12 import sites (already mapped during research).
- Confirm `jest.config.js` coverage globs catch the relocated files; otherwise coverage threshold will silently regress.
- Do **not** introduce aliases in this unit. Imports stay relative — just pointing at the new locations.

**Patterns to follow:**

- Existing barrel `index.ts` shape under each moved folder is preserved as-is.
- `git mv` semantics, not delete + add — keeps blame readable.

**Test scenarios:**

- Happy path: `pnpm nx run api:typecheck` exits 0 with no missing-module errors.
- Happy path: `pnpm nx test api` (all of `unit`, `int`, `e2e` configurations) passes with the same number of tests as on `main`.
- Happy path: `pnpm nx build api` produces the same dist output (function smoke: `pnpm nx serve api` starts and `GET /api` returns the same banner).
- Happy path: `pnpm migration:show` from `apps/api/` lists the existing `1708000000000-create-identity-schema-and-user-table` migration with no resolution errors.
- Happy path: `pnpm nx run api:lint:arch` passes (no new dep-cruiser violations introduced).
- Edge case: coverage report after `pnpm nx test api --configuration=unit` includes `src/module/shared/**` files and meets the existing 78%/80% threshold.

**Verification:**

- `apps/api/src/infra/` and `apps/api/src/persistence/` no longer exist.
- `apps/api/src/module/shared/{config,mail,typeorm,persistence}/` all exist with their files.
- All eight test/build/migration commands above succeed locally.

---

- [ ] **Unit 2: Add public-API barrel to `module/identity/` (and any module missing one)**

**Goal:** Establish a deliberate public API for each domain module so external consumers go through `index.ts`. Required before aliasing because `@module/identity` resolves to that barrel.

**Requirements:** R4

**Dependencies:** Unit 1.

**Files:**

- Create: `apps/api/src/module/identity/index.ts`
- Confirm exists (no change): `apps/api/src/module/shared/{config,mail,typeorm,persistence}/index.ts` (already in place; audit each for completeness against actual external usage).

**Approach:**

- The identity barrel exports exactly what's used externally today, no more:
  - `IdentityModule` — for `app.module.ts`
  - `UserEntity`, `PasswordResetTokenEntity` — for `data-source.ts` CLI registration
- Audit each shared barrel (`config`, `mail`, `typeorm`, `persistence`) against grep results to confirm every consumer's required symbol is exported. Add any missing re-exports rather than letting consumers deep-import.
- Do **not** export internal types (services, repositories, DTOs, guards) from `@module/identity`. These are not used outside the module today and exposing them invites future leaks.
- Do **not** add `index.ts` to `module/app/` — it has no external consumers (only `main.ts` imports `AppModule` directly, and `main.ts` lives one level above so that import shape is intentional and stays).

**Patterns to follow:**

- Match the export shape of existing shared barrels (`infra/config/index.ts`, etc.): a flat `export { X } from './X'` block, types prefixed with `type` per the existing file.

**Test scenarios:**

- Happy path: `pnpm nx run api:typecheck` exits 0; `index.ts` re-exports compile.
- Happy path: A direct relative import of `IdentityModule` from `app.module.ts` and a direct relative import of `UserEntity` from `data-source.ts` both still work (barrel addition is non-breaking).
- Edge case: Importing `import { AuthService } from './module/identity'` produces a TypeScript error (the barrel deliberately omits it). This is a positive — it validates the barrel actually constrains the public API.
- Happy path: `pnpm nx test api` passes unchanged.

**Verification:**

- `apps/api/src/module/identity/index.ts` exists and exports exactly `IdentityModule`, `UserEntity`, `PasswordResetTokenEntity`.
- A scan of `grep -rn "from '\.\./identity/" apps/api/src` shows zero deep imports from outside the module after the alias migration in Unit 4 (verified later, noted here for traceability).

---

- [ ] **Unit 3: Wire `@module/*` path aliases into TypeScript, webpack, ts-jest, and ts-node**

**Goal:** Make `@module/identity`, `@module/shared/config`, `@module/shared/mail`, `@module/shared/typeorm`, `@module/shared/persistence` resolve correctly under (a) `tsc` typecheck, (b) `pnpm nx build api` (webpack), (c) `pnpm nx test api` (ts-jest), and (d) `pnpm typeorm` / `pnpm migration:*` (ts-node-commonjs CLI). No imports are migrated yet.

**Requirements:** R3

**Dependencies:** Unit 2.

**Files:**

- Modify: `apps/api/tsconfig.app.json` — add `compilerOptions.baseUrl: "."` and `compilerOptions.paths` mapping for the five aliases.
- Modify: `apps/api/tsconfig.spec.json` — same `baseUrl` + `paths` (it inherits from `tsconfig.app.json` but path mappings need to be present in the active config used by ts-jest).
- Modify: `apps/api/tsconfig.cli.json` — same `baseUrl` + `paths`.
- Modify: `apps/api/jest.config.js` — derive `moduleNameMapper` from tsconfig paths via `pathsToModuleNameMapper` from `ts-jest`.
- Modify (if needed): `apps/api/webpack.config.*` (or equivalent Nx-managed config) — confirm `tsconfig-paths-webpack-plugin` is enabled; add it if Nx's default doesn't already wire it for the `@nx/webpack:webpack` executor in this version.
- Modify (if needed): `apps/api/package.json` — prepend `-r tsconfig-paths/register` to the `typeorm` script if `typeorm-ts-node-commonjs` does not pick aliases up via `TS_NODE_PROJECT=tsconfig.cli.json` alone.
- Add (if needed): `tsconfig-paths` and/or `tsconfig-paths-webpack-plugin` as dev dependencies (verify they aren't already transitively installed).

**Approach:**

- Mappings use the source `index.ts` directly (consistent with the workspace's `customConditions: ["@org/source"]` source-resolution model):
  - `"@module/identity": ["src/module/identity/index.ts"]`
  - `"@module/shared/config": ["src/module/shared/config/index.ts"]`
  - `"@module/shared/mail": ["src/module/shared/mail/index.ts"]`
  - `"@module/shared/typeorm": ["src/module/shared/typeorm/index.ts"]`
  - `"@module/shared/persistence": ["src/module/shared/persistence/index.ts"]`
- Smoke-test by switching exactly **one** consumer (e.g., `app.module.ts` `ConfigModule` import) to the alias before broadcasting the change in Unit 4. This isolates "did the alias work?" from "is the alias rewrite correct everywhere?".
- For each tool, the reasoning: tsc reads `paths` directly; ts-jest needs `pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' })`; webpack needs `tsconfig-paths-webpack-plugin` registered against `tsconfig.app.json`; ts-node-commonjs needs `-r tsconfig-paths/register` *or* `tsconfig.cli.json` already references the paths in a way ts-node honors (verify which).
- The dependency-cruiser `tsConfig.fileName: "tsconfig.app.json"` already in `.dependency-cruiser.cjs` will pick up the new `paths` automatically — no rule change needed in this unit.

**Patterns to follow:**

- ts-jest's `pathsToModuleNameMapper` documented usage; mirror any similar setup if other Nx repos in the workspace already use it (none in this repo today).

**Test scenarios:**

- Happy path: After switching one consumer to `@module/...`, `pnpm nx run api:typecheck` exits 0.
- Happy path: `pnpm nx test api` (unit, int, e2e) all pass; ts-jest resolves the alias.
- Happy path: `pnpm nx build api` produces a working bundle; `pnpm nx serve api` boots and `GET /api/health` (or the equivalent existing endpoint) responds.
- Happy path: `pnpm migration:show` resolves and lists the existing migration with no module-not-found errors.
- Edge case: Reverting the smoke-test alias swap and re-running everything still passes (proves the alias plumbing is additive, not coupled to any specific consumer).
- Error path: Introducing a deliberately wrong alias (`@module/typo`) produces a TypeScript / Jest / ts-node error rather than silently resolving — confirms strict resolution.

**Verification:**

- All four toolchains (tsc, jest, webpack, ts-node) resolve `@module/*` to the correct files.
- The smoke-test consumer is reverted before this unit closes (Unit 4 owns the broad migration).

---

- [ ] **Unit 4: Migrate all cross-module relative imports to `@module/*` aliases**

**Goal:** Sweep every cross-module import in `apps/api/src/` to use the new aliases; leave within-module imports as relative paths.

**Requirements:** R5, R8

**Dependencies:** Unit 3.

**Files (cross-module import sites — all to be rewritten):**

- Modify: `apps/api/src/data-source.ts` (entities + `buildDataSourceOptions`)
- Modify: `apps/api/src/module/app/app.module.ts` (`ConfigModule`, `PersistenceModule`, `IdentityModule`)
- Modify: `apps/api/src/module/identity/identity.module.ts` (`IJwtConfig`, `MailModule`)
- Modify: `apps/api/src/module/identity/core/auth.service.ts` (`EMAIL_SERVICE`, `IEmailService`, `MAIL_CONFIG_KEY`, `IMailConfig`)
- Audit (no expected change): `apps/api/src/module/identity/core/__tests__/auth.service.int-spec.ts`, `auth.service.spec.ts`, `user.service.spec.ts`, `apps/api/src/module/identity/http/controller/__tests__/auth.controller.e2e-spec.ts`, `user.controller.e2e-spec.ts` — these are within-module relative imports (`../../persistence/...`) and stay relative per the "relatives within, aliases across" rule.

**Approach:**

- Greppable inventory of cross-module imports to rewrite:
  - `from '../../infra/...'` → `from '@module/shared/...'`
  - `from '../../../infra/...'` → `from '@module/shared/...'`
  - `from '../../persistence'` → `from '@module/shared/persistence'`
  - `from './module/identity/...'` (in `data-source.ts`) → `from '@module/identity'`
  - `from '../identity/identity.module'` (if any) → `from '@module/identity'`
- Within-module imports stay relative. Quick grep check to confirm no rewrite leaked into a module's own internals: `grep -rn "@module/identity" apps/api/src/module/identity/` should return zero hits.
- Update one file at a time and run typecheck between each batch — easier to bisect than a single large edit.

**Patterns to follow:**

- The "alias for crossing module boundaries, relative inside" convention encoded in this plan and reinforced by Unit 5's governance rules.

**Test scenarios:**

- Happy path: `pnpm nx run api:typecheck` exits 0.
- Happy path: `pnpm nx test api` (all configurations) passes.
- Happy path: `pnpm nx build api` and `pnpm nx serve api` work; `GET /api` returns the expected response.
- Happy path: `pnpm migration:show` lists migrations correctly using the aliased entity imports.
- Integration scenario: full `auth.controller.e2e-spec.ts` run with the new alias-driven module import graph still hits the database, registers a user, logs in, and resets a password.
- Edge case: `grep -rn "from '\.\./\.\./infra\|from '\.\./\.\./\.\./infra\|from '\.\./persistence\|from '\.\./\.\./persistence" apps/api/src` returns zero matches — confirms migration completeness.
- Edge case: `grep -rn "@module/identity" apps/api/src/module/identity/` returns zero matches — confirms no within-module aliasing leaked in.

**Verification:**

- All cross-module imports use `@module/...`.
- All within-module imports remain relative.
- All tests, builds, and CLI commands continue to pass.

---

- [ ] **Unit 5: Extend dependency-cruiser to encode the new shared-module rules**

**Goal:** Make the new boundary explicit and machine-checkable: domains may import from shared, shared may not import from any domain, app remains the orchestrator exception, and sibling-domain imports remain forbidden.

**Requirements:** R6, R8

**Dependencies:** Unit 4 (otherwise the rule additions would flag the in-flight refactor as violations).

**Files:**

- Modify: `apps/api/.dependency-cruiser.cjs` — refine the existing `no-cross-module-imports` rule and add a new `no-shared-to-domain` rule.

**Approach:**

- **Rule A — `no-cross-module-imports` (refined):**
  - `from.path: ^src/module/(?!app/|shared/)([^/]+)/.+` — source is any non-orchestrator, non-shared module.
  - `to.path: ^src/module/([^/]+)/.+`
  - `to.pathNot: ^src/module/(\$1|shared)/.+` — destination must be either the source's own module *or* `shared/`. Anything else fires the rule.
  - The `\$1|shared` alternation in `pathNot` keeps the auto-scaling property: adding a new domain still doesn't require config changes.
- **Rule B (new) — `no-shared-to-domain`:**
  - `from.path: ^src/module/shared/.+`
  - `to.path: ^src/module/(?!shared/|app/)[^/]+/.+`
  - Severity `error`. Comment: "Shared modules must not depend on any domain — keeps the dependency direction one-way."
  - Note: app is also excluded as a destination; shared has no reason to import from app, but excluding it avoids accidental orchestrator-into-shared coupling tripping the wrong rule.
- The existing `no-circular` rule stays as-is.
- The `tsConfig.fileName: "tsconfig.app.json"` setting now picks up the `paths` from Unit 3 — dep-cruiser will resolve `@module/...` accurately.
- After updating, run `pnpm nx run api:lint:arch` to confirm no false positives on the live codebase.

**Patterns to follow:**

- ADR-0002: keep using the `$1` backreference auto-scaling pattern; do not switch to project tags or hand-listed module names.

**Test scenarios:**

- Happy path: `pnpm nx run api:lint:arch` reports zero violations on the post-Unit-4 codebase.
- Error path (positive enforcement test — *temporary, revert after verification*): introduce a deliberate violating import in `apps/api/src/module/shared/config/segment/mail.config.ts`:
  - `import { UserEntity } from '@module/identity'`
  - `pnpm nx run api:lint:arch` must exit non-zero with `no-shared-to-domain` reported.
- Error path (positive enforcement test — *temporary, revert after verification*): introduce a deliberate sibling-domain violation in a hypothetical new `apps/api/src/module/__test_domain/foo.ts`:
  - `import { UserEntity } from '@module/identity'`
  - `pnpm nx run api:lint:arch` must exit non-zero with `no-cross-module-imports` reported.
- Happy path: `module/app/app.module.ts` continues to import `IdentityModule`, `ConfigModule`, `PersistenceModule` without violations (orchestrator exemption preserved).
- Happy path: `module/identity/*` continues to import from `@module/shared/*` without violations.
- Edge case: `pnpm nx run api:lint:arch --output-type dot` produces a graph with no edges from `module/shared/*` to any domain.

**Verification:**

- `lint:arch` is clean on the post-refactor codebase.
- Both deliberate-violation tests have been run, observed to fail correctly, and reverted.
- ADR-0002's auto-scaling property is preserved (no module names hard-coded in either rule).

---

- [ ] **Unit 6: Update repo documentation to reflect the new structure**

**Goal:** Bring documentation in sync so the next contributor (human or agent) sees the same structure that's actually on disk.

**Requirements:** R7

**Dependencies:** Unit 5.

**Files:**

- Modify: `CLAUDE.md` (root) — update the "API Module Structure" tree and any references to `infra/` or top-level `persistence/`. Add a short note on `@module/*` aliases and the dep-cruiser shared rule.
- Modify: `docs/MODULAR-PRINCIPLES.md` — adjust §1 if it references the old layout; add a paragraph on `module/shared/*` as the in-app analogue of the future `libs/shared/*`.
- Create (recommended, not strictly required): `docs/adr/0006-module-shared-and-path-aliases.md` documenting:
  - context (relative imports, no public-API barrel, governance limited to sibling-domain rule),
  - decision (move infra+persistence under `module/shared/`, adopt `@module/*` aliases, extend dep-cruiser with `no-shared-to-domain`),
  - consequences (positive: explicit boundaries, machine-checkable; negative: small alias maintenance burden in tsconfigs/jest/webpack/ts-node; neutral: keeps dep-cruiser as governance per ADR-0002).
- Audit (no expected changes): `docs/STATE-ISOLATION.md` and `docs/DOMAINS-DEFINITION.md` — confirm neither references `infra/` paths.

**Approach:**

- Keep doc edits surgical: replace path references, do not rewrite the philosophy.
- ADR-0006 follows the existing ADR template (see ADR-0002 for shape).

**Patterns to follow:**

- Existing ADR structure (`Context`, `Decision Drivers`, `Options Considered`, `Decision`, `Consequences`).
- CLAUDE.md table-driven layout already in place.

**Test scenarios:**

- Happy path: `grep -rn "infra/" CLAUDE.md docs/` returns no matches against the old layout.
- Happy path: `grep -rn "src/persistence" CLAUDE.md docs/` returns no matches against the old top-level path.
- Happy path: ADR-0006 renders cleanly and references ADR-0002 as the governance precedent.

**Verification:**

- A new contributor reading `CLAUDE.md` sees the post-refactor tree.
- ADR-0006 captures the rationale so this plan can be archived without losing context.

## System-Wide Impact

- **Interaction graph:** Module composition stays identical at runtime — `AppModule` still imports the same set of modules; only how they're located on disk and named in import statements changes. NestJS DI wiring is untouched.
- **Error propagation:** None of the error-handling pathways (HTTP filters, validation pipes, JWT guard) are touched. No change in observable error behavior.
- **State lifecycle risks:** TypeORM CLI (`data-source.ts`) is the highest-risk surface — if alias resolution silently falls back during migration runs, the wrong entity set could be loaded. Mitigated by Unit 3's CLI-specific verification (`pnpm migration:show`) and by Unit 4's e2e test rerun.
- **API surface parity:** No change to HTTP routes, DTOs, response shapes, or auth contract.
- **Integration coverage:** Existing `auth.controller.e2e-spec.ts` and `user.controller.e2e-spec.ts` are the integration safety net — they exercise the full DI graph including DataSource creation, schema isolation, and JWT signing. Each unit's verification depends on these continuing to pass unchanged.
- **Unchanged invariants:**
  - The dep-cruiser `no-circular` rule, `tsConfig.fileName: "tsconfig.app.json"`, and ADR-0002's auto-scaling `$1` pattern stay intact.
  - Schema isolation (`@Entity({ schema: 'identity', ... })`) is untouched.
  - The CLI/runtime DataSource sharing pattern from the prior persistence refactor (one `buildDataSourceOptions` source of truth) is preserved.
  - `customConditions: ["@org/source"]` in `tsconfig.base.json` is **not** modified — `@module/*` is an app-internal alias and orthogonal to the workspace's source-condition mechanism.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Webpack production build doesn't honor `paths` (Nx's default may not include `tsconfig-paths-webpack-plugin` for the version in use) | Unit 3 explicitly verifies `pnpm nx build api` after one alias swap; if it fails, add the plugin before broadening the migration in Unit 4. |
| TypeORM CLI (`typeorm-ts-node-commonjs`) doesn't resolve `@module/*` and silently fails to load entities | Unit 3 runs `pnpm migration:show` as an explicit smoke test; if it fails, prepend `-r tsconfig-paths/register` to the `typeorm` script. |
| Coverage threshold regresses because `jest.config.js` `collectCoverageFrom` paths drift out of sync after the move | Unit 1 explicitly updates the `collectCoverageFrom` globs and re-runs coverage; threshold was set to 78% branches in the prior persistence refactor and should hold. |
| Identity barrel under-exports, breaking `data-source.ts` after Unit 4 | Unit 2 deliberately exports `UserEntity` and `PasswordResetTokenEntity` from `@module/identity`; Unit 3's `pnpm migration:show` smoke test catches any miss before the wide migration. |
| Unit 5's new `no-shared-to-domain` rule fires on existing code we haven't noticed | `pnpm nx run api:lint:arch` is run as part of Unit 1's verification (with the pre-update rule) and again at Unit 5's start (with the new rule). Any pre-existing violation is surfaced before the rule is committed. |
| Dependency-cruiser version doesn't support the `\|` alternation in `pathNot` `\$1` backreferences | ADR-0002 confirms dep-cruiser v10+ supports the backreference; current version is `^17.3.9` (per root `package.json`), well past the threshold. Standard regex alternation is supported. |
| `module/app/app.module.ts` imports a sibling domain directly (e.g., `IdentityModule`) — would the refined Rule A still permit this? | Rule A's source pattern `(?!app/\|shared/)` excludes `app` from being a forbidden source, so the orchestrator exception is preserved exactly as today. Verified in Unit 5's happy-path scenario. |

## Documentation / Operational Notes

- No production rollout, no migration, no feature flag — this is a code-shape refactor with zero runtime impact.
- A single commit per implementation unit is recommended so the diff stays bisectable and reviewable.
- After Unit 6, this plan moves to `status: completed`, and ADR-0006 (if created) becomes the long-term reference.

## Sources & References

- **Origin document:** none (planned directly from the user's request — no prior brainstorm doc).
- ADR-0002 — `docs/adr/0002-enforce-module-isolation-with-dependency-cruiser.md` (governance precedent).
- ADR-0001 — `docs/adr/0001-centralize-env-config-with-nestjs-config-and-zod.md` (config pattern).
- Prior plan — `docs/plans/2026-04-21-001-refactor-persistence-layer-plan.md` (typeorm/persistence separation precedent).
- Modular principles — `docs/MODULAR-PRINCIPLES.md` (target architecture this plan moves toward).
- State isolation — `docs/STATE-ISOLATION.md` (invariant preserved through the refactor).
- Project context — `CLAUDE.md` (current structure description, to be updated in Unit 6).
