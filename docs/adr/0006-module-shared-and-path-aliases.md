# 0006. Consolidate cross-cutting concerns under module/shared and adopt @module/* path aliases

Date: 2026-05-04
Status: Accepted

## Context

The API split its NestJS modules across three top-level locations: `apps/api/src/module/` for domain modules (e.g., `identity/`), `apps/api/src/infra/` for cross-cutting concerns (`config/`, `mail/`, `typeorm/`), and `apps/api/src/persistence/` for the `DataSourceOptions` builder and aggregator module. The split predated any concrete dependency rules, and the cross-cutting layers grew under the implicit understanding that they were "infrastructure" rather than full NestJS modules.

Two problems surfaced as the codebase grew:

- **Mental-model fragmentation.** When asked "where does an X module live?", the answer depended on whether X was a bounded context or a support concern. New contributors had to learn three roots (`module/`, `infra/`, `persistence/`) and the unwritten rule about which kind belongs where.
- **Cross-module imports were brittle and uninspectable.** Imports relied on long relative paths like `'../../../../infra/mail/interface/email-service.interface'`. Such paths reach into module internals (bypassing any public-API barrel), break silently when files move, and offer no signal at the import site about which module is being consumed.

The dependency-cruiser rule from ADR-0002 (`no-cross-module-imports`) only governed `module/*` boundaries. It said nothing about whether `infra/mail/` could depend on `module/identity/` (it shouldn't, but nothing enforced it), and it had to be re-derived for every new "infra" location anyone added.

## Decision Drivers

- **One mental model.** A reader should find every NestJS module in one place and tell at a glance which kind it is (orchestrator, domain, shared).
- **Explicit cross-module surface.** Cross-module imports should name the module they consume and resolve through that module's published barrel — no deep paths into internals.
- **Inspectable boundary direction.** The dependency rules must distinguish "domain may use shared" from "shared may use domain" and enforce the asymmetry.
- **Auto-scaling rules.** Adding a new bounded context or a new shared concern should not require editing the dependency-cruiser config.
- **Toolchain coverage.** Whatever import scheme we adopt must work uniformly across `tsc`, `webpack` (build), `ts-jest` (tests), and `ts-node` (TypeORM CLI). A scheme that needs a workaround in any of them is a tax we'd pay forever.

## Options Considered

### Option A: Keep three roots (`module/`, `infra/`, `persistence/`) and improve relative imports

Leave the layout alone, document the convention more clearly, accept long relative paths.

- Pro: No code movement, no toolchain changes
- Con: Does not solve the boundary-direction problem — dep-cruiser can't easily distinguish "infra" from "module" without bespoke patterns
- Con: Long relative paths remain a source of churn and poor signal

### Option B: Move infra/persistence under `module/shared/*`, but keep relative imports

Consolidate locations but keep `'../../shared/config'`-style imports.

- Pro: Single mental model
- Pro: dep-cruiser rules can be expressed against one root with a single pair of patterns
- Con: Leaves relative imports brittle — moving a file by one directory breaks every consumer
- Con: Imports do not advertise the public-API boundary; they still reach into wherever the path lands

### Option C: Move under `module/shared/*` AND adopt `@module/*` path aliases for cross-module imports

Both consolidations together: one root for every NestJS module, plus a stable named-import scheme that resolves to each module's `index.ts` barrel.

- Pro: Single mental model and stable cross-module surface
- Pro: Imports declare which module is being consumed (`from '@module/shared/config'` vs `from '../../../shared/config'`)
- Pro: dep-cruiser rules can govern both axes — domain → shared (allowed) and shared → domain (forbidden) — using `$1` backreferences that auto-scale
- Pro: Aliases mechanically force consumers through the public-API barrel; deep imports into internals can be detected and forbidden
- Con: Requires wiring the same aliases through four toolchains: `tsc`, `webpack` (`tsconfig-paths-webpack-plugin`), `ts-jest` (`pathsToModuleNameMapper`), and `ts-node` (`tsconfig-paths/register` via `NODE_OPTIONS`). Each was a small, one-time configuration change but added together they are real
- Con: `NxAppWebpackPlugin` with `compiler: "tsc"` does not auto-resolve `tsconfig.compilerOptions.paths` — explicit `TsconfigPathsPlugin` registration is required

### Option D: Move under `module/shared/*` and adopt a single `@module` namespace alias

Same as Option C, but use one alias (e.g., `@module`) that resolves to `src/module/`, so consumers write `from '@module/shared/config'` as an aliased path rather than `@module/shared/config` resolving to a barrel.

- Pro: One alias, less tsconfig surface
- Con: Does not force imports through `index.ts` — `@module/shared/config/segment/mail.config` would still resolve. The boundary-via-barrel guarantee is weaker
- Con: Indistinguishable visually from a deep path; loses the "named consumer" property

## Decision

We chose **Option C**. Every NestJS module — orchestrator, domain, or shared — lives under `apps/api/src/module/`. Cross-module imports must use one of five `@module/*` aliases (`@module/identity`, `@module/shared/{config,mail,typeorm,persistence}`), each resolving directly to that module's `index.ts` barrel. Within-module imports stay relative.

Dependency-cruiser was extended with two rules:

- `no-cross-module-imports` (existing, refined): a domain module may only depend on itself or any sub-module under `shared/`. Source pattern excludes `app/` (orchestrator) and `shared/` (governed below). The `$1` backreference auto-scales — adding `module/payments/` is covered with no config edit.
- `no-shared-to-domain` (new): any file under `module/shared/` is forbidden from depending on a domain module. Shared sub-modules may depend on each other but never on `identity`, `books`, or any future context — preventing the support layer from coupling to specific business contexts.

Path aliases are wired uniformly through every toolchain that touches the source:

| Toolchain | Mechanism |
|-----------|-----------|
| `tsc` | `compilerOptions.baseUrl` + `paths` in `tsconfig.{app,spec,cli}.json` |
| `webpack` | `tsconfig-paths-webpack-plugin` registered in `resolve.plugins` |
| `ts-jest` | `pathsToModuleNameMapper` in `jest.config.js` |
| `ts-node` (TypeORM CLI) | `NODE_OPTIONS="-r tsconfig-paths/register"` prepended to the `typeorm` script |

## Consequences

### Positive

- One root (`module/`) holds every NestJS module. Newcomers do not need to learn `infra/` and `persistence/` as separate concepts.
- Cross-module imports advertise their consumer at the import site (`from '@module/shared/mail'`). Renaming or moving a module updates one alias entry; consumers are unaffected.
- Aliases mechanically route imports through each module's `index.ts` barrel, making the public surface visible and (with future tightening) enforceable.
- Boundary direction is explicit and enforced by static analysis: `domain → shared` is allowed, `shared → domain` is forbidden. Both rules auto-scale with new modules.
- `module/app/` retains its orchestrator exception — it is the only place that imports across context boundaries by design.

### Negative / Trade-offs

- Path aliases must be maintained in four config files. They drift if added in tsconfig but forgotten in jest/webpack/ts-node. This is a one-time cost per new alias and is centrally documented in this ADR.
- `NxAppWebpackPlugin` does not auto-resolve `tsconfig.paths`. The dependency on `tsconfig-paths-webpack-plugin` is now load-bearing — a major-version Nx upgrade should re-verify alias resolution.
- Cross-shared-submodule imports (e.g., `shared/mail` → `shared/config`) also flow through `@module/*` aliases, so even internal shared traffic is mediated by public barrels. This is intentional for consistency but means a barrel must export everything any sibling needs.

### Neutral / Watch

- The convention bets that the number of shared concerns stays small. If `module/shared/` grows beyond a handful of sub-modules, the flat structure may need a second layer (e.g., `module/shared/persistence-bundle/{typeorm,persistence}`).
- The `$1` group backreference in `no-cross-module-imports` is a dependency-cruiser v10+ feature (per ADR-0002). The `(\$1|shared)` extension keeps the same constraint.
- If the project later migrates to Nx project-per-module, both the alias scheme and the dep-cruiser rules will need to be re-evaluated against `@nx/enforce-module-boundaries`.
