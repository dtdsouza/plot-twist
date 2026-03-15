# 0002. Enforce module isolation with dependency-cruiser

Date: 2026-03-15
Status: Accepted

## Context

A Jest-based fitness function (`module-isolation.spec.ts`) enforced cross-module boundary rules by walking the filesystem and matching import paths with regex. The approach was fragile — regex cannot resolve TypeScript path aliases, re-exports, or barrel files, so violations could slip through undetected. It also only surfaced errors at test time, not during development or static analysis. As the module count grows, the spec would need manual updates to track new modules.

## Decision Drivers

- Correctness: the tool must understand real TypeScript module resolution, not approximate it with regex
- Auto-scaling: adding a new module should not require updating the enforcement config
- Developer feedback loop: violations should be catchable without running the full test suite
- Minimal friction: the solution should not require restructuring the existing module architecture

## Options Considered

### Option A: Keep and improve the Jest regex spec
Continue using the `fs` + regex approach but add handling for barrel file re-exports and path alias resolution.

- Pro: No new dependencies
- Con: Regex-based resolution remains fundamentally approximate — edge cases will always exist
- Con: Feedback is still gated behind `nx test`

### Option B: @nx/enforce-module-boundaries (ESLint rule)
Use Nx's built-in boundary enforcement, which relies on project tags to define allowed dependencies between Nx projects.

- Pro: First-class Nx integration, runs in the ESLint pass
- Con: Requires migrating the current `src/module/` directory structure to separate Nx projects with tags — a significant architectural change not justified by the current codebase size
- Con: Tags must be maintained manually per project

### Option C: eslint-plugin-boundaries
A dedicated ESLint plugin for enforcing architectural boundaries using glob patterns.

- Pro: Runs in the ESLint pass, integrates with existing editor tooling
- Pro: No structural changes required
- Con: Pattern-based rather than graph-based — still subject to aliasing and re-export edge cases depending on resolver configuration

### Option D: ts-arch
A test library for asserting architectural rules in TypeScript projects, similar to ArchUnit in the Java ecosystem.

- Pro: Test-style assertions are readable and familiar
- Con: Sits inside the test suite — same feedback timing problem as the Jest spec
- Con: Less active maintenance than the alternatives

### Option E: dependency-cruiser
A static analysis tool that builds a real dependency graph using Node.js module resolution and TypeScript compiler APIs, then validates it against declared rules.

- Pro: Resolves imports accurately — handles aliases, re-exports, and barrel files correctly
- Con: Adds a new dev dependency
- Pro: Group restriction backreferences (`$1` in `pathNot`) make the rule auto-scale — no config change needed when a new module is added
- Pro: Runs as a standalone Nx target, decoupled from the test suite

## Decision

We chose **Option E (dependency-cruiser)** because it is the only option that performs accurate graph-based resolution rather than pattern approximation, which was the core failure of the previous approach. The `$1` group backreference in the `no-cross-module-imports` rule means the config does not need to be updated as new modules are added. `@nx/enforce-module-boundaries` would have been the natural Nx-idiomatic choice, but it requires a module-to-project migration that is not warranted at the current scale.

## Consequences

### Positive
- Import violations are detected accurately, including through re-exports and barrel files
- The rule self-scales: adding `src/module/payments/` (for example) is automatically covered with no config change
- The `app` module exclusion is expressed as a negative lookahead in the `from.path` pattern, matching the original spec's intent exactly
- Enforcement runs as `pnpm nx run api:lint:arch`, independent of the test suite

### Negative / Trade-offs
- `lint:arch` is a separate target — it will not catch violations if a developer only runs `nx test`. It needs to be added to the CI pipeline explicitly
- Adds `dependency-cruiser` as a dev dependency alongside the existing ESLint toolchain

### Neutral / Watch
- The `$1` group restriction backreference is a dependency-cruiser v10+ feature — a major version downgrade would require rewriting the rule
- If the project migrates to Nx project-per-module structure in the future, `@nx/enforce-module-boundaries` should be re-evaluated as a replacement
