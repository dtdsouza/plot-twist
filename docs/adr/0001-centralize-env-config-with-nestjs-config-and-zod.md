# 0001. Centralize environment configuration with @nestjs/config and Zod

Date: 2026-03-15
Status: Accepted

## Context

Environment configuration was scattered across 4 files (`app.module.ts`, `identity.module.ts`, `main.ts`, `data-source.ts`) with duplicated `process.env` access, no validation, and unsafe fallback values — including a hardcoded JWT secret. There was no single source of truth for what env vars the application required, what their types were, or what defaults applied. This created risk of silent misconfiguration in production and violated DRY.

## Decision Drivers

- Type safety: env vars should be typed at compile time, not stringly-typed at runtime
- Fail-fast: the app should crash on startup with a clear error if config is invalid, not fail silently at request time
- Security: no hardcoded secret fallbacks — secrets must be explicitly provided
- DRY: env var access should happen in one place, not be duplicated across modules
- Immutability: config objects should be frozen after creation, per project coding standards

## Options Considered

### Option A: @nestjs/config + Zod (hybrid)
Use `@nestjs/config` for NestJS DI integration and `.env` file loading. Use Zod to validate all env vars at startup via the `validate` callback. Config is split into namespaced segments (`app`, `database`, `jwt`) exposed through `ConfigService`.

- Pro: Zod provides type inference from the schema — no separate type maintenance
- Pro: Zod is high-performance and actively maintained
- Pro: `@nestjs/config` handles DI, `.env` loading, and namespacing out of the box
- Pro: `registerAs()` factories produce frozen, namespaced config objects
- Con: Two libraries involved instead of one

### Option B: @nestjs/config + Joi
The officially documented pairing in NestJS docs. Joi handles validation via the `validationSchema` option.

- Pro: First-class NestJS documentation support
- Con: Joi does not infer TypeScript types — requires maintaining a separate interface per config segment
- Con: Larger bundle size than Zod
- Con: Less active maintenance compared to Zod

### Option C: @nestjs/config + class-validator/class-transformer
Use `class-validator` decorators (already in the project for DTO validation) with `class-transformer` to validate env vars.

- Pro: Consistent with existing DTO validation approach
- Con: Requires class instances — heavier boilerplate than a schema declaration
- Con: No type inference from decorators — types must be maintained separately
- Con: `class-transformer` adds runtime overhead for plain env var coercion

## Decision

We chose **Option A (@nestjs/config + Zod)** because Zod provides compile-time type inference directly from the validation schema, eliminating the need to maintain separate TypeScript interfaces for env vars. Its active maintenance and performance characteristics made it preferable to Joi. While `class-validator` is already in the project, its decorator-based approach adds unnecessary boilerplate for what is fundamentally a data-shape validation problem, not a class validation problem.

## Consequences

### Positive
- All env vars are validated at startup — invalid config crashes immediately with a clear error message listing every failing field
- `TEnv` type is inferred from the Zod schema — adding a new env var means editing one file, not two
- Config segments return `Object.freeze()`-ed objects, enforcing immutability
- `JWT_SECRET` has no default — the app will not start without an explicitly provided secret
- `data-source.ts` (TypeORM CLI, outside NestJS context) shares the same Zod schema, keeping a single source of truth

### Negative / Trade-offs
- Adds Zod as a new dependency alongside the existing `class-validator` — two validation libraries in the project
- Developers must learn Zod syntax for env config, even though DTOs still use `class-validator`
- The `validate` callback in `@nestjs/config` runs before `registerAs()` factories — factories read raw `process.env`, which means coerced/defaulted values from Zod are not automatically available to them (factories must do their own coercion)

### Neutral / Watch
- If Zod adoption grows beyond env config (e.g., replacing `class-validator` for DTOs), consider a project-wide migration to reduce the two-library split
- The `isGlobal: true` setting means `ConfigModule` is imported once in `AppModule` — if module isolation becomes important later, this may need revisiting
