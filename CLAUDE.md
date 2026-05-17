# Plot-Twist Book Club

## Project Overview

Plot-Twist is a book club application built as an Nx monorepo. It consists of a Next.js frontend and a NestJS backend API, with shared libraries organized by scope and type.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Monorepo | Nx | 22 |
| Frontend | Next.js (App Router) | 16 |
| Backend | NestJS | 11 |
| ORM | TypeORM | 0.3 |
| Database | PostgreSQL | 16 |
| Email | Resend | - |
| Validation | Zod (env), class-validator (DTOs) | - |
| Package Manager | pnpm | 10.x |
| Runtime | Node.js | 22 LTS |

## Monorepo Structure

```
plot-twist/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── folderStructure.config.mjs # eslint-plugin-project-structure rules
│   │   ├── eslint.config.mjs         # ESLint 9 flat config
│   │   └── src/
│   │       ├── data-source.ts        # TypeORM data source config (CLI entrypoint)
│   │       ├── main.ts
│   │       ├── app.module.ts         # Root AppModule (orchestrator)
│   │       ├── module/               # Domain modules (bounded contexts)
│   │       │   └── identity/         # Domain: auth, users, password reset
│   │       └── shared/               # Cross-cutting support
│   │           ├── __test-support__/ # Generic DB/jest helpers (per-worker DB isolation)
│   │           ├── image/            # Library: image-format utilities (no NestJS module)
│   │           └── module/           # Shared NestJS modules
│   │               ├── config/       # Centralized env config (Zod-validated)
│   │               ├── logging/      # Winston-based structured logging, request correlation, redaction
│   │               ├── mail/         # Resend email service
│   │               ├── persistence/  # BaseEntity, BaseRepository, PersistenceModule, DataSourceOptions builder
│   │               └── storage/      # Generic S3 storage client (presigned POST, HEAD, copy, delete)
│   └── web/                          # Next.js frontend
├── docs/                             # Architecture docs
│   ├── adr/                          # Architecture Decision Records
│   ├── brainstorms/                  # Feature brainstorm docs
│   ├── plans/                        # Implementation plans
│   ├── DOMAINS-DEFINITION.md         # Domain boundaries
│   ├── MODULAR-PRINCIPLES.md         # Module design rules
│   └── STATE-ISOLATION.md            # Schema isolation rules
├── libs/                             # Shared libraries (convention below)
└── docker-compose.yml                # PostgreSQL 16, API, Web
```

### API Module Structure

The `apps/api/src/` tree has three layers:

| Kind | Location | Purpose |
|------|----------|---------|
| Orchestrator | `src/app.module.ts` | Root `AppModule`; composes domain + shared modules |
| Domain | `src/module/{domain}/` (e.g., `identity/`) | A bounded context with its own schema |
| Shared module | `src/shared/module/{concern}/` | Cross-cutting NestJS modules (config, logging, mail, persistence, storage) |
| Shared library | `src/shared/{library}/` (e.g., `image/`) | Pure utilities, no NestJS module |
| Shared test-support | `src/shared/__test-support__/` | Generic DB/jest helpers (per-worker DB isolation) |

Folder structure is enforced by `apps/api/folderStructure.config.mjs` via `eslint-plugin-project-structure`.

Each domain module follows this internal layout:

```
module/{domain}/
├── core/               # Business logic (services)
│   └── __tests__/
├── http/               # HTTP layer
│   ├── controller/
│   │   └── __tests__/
│   └── dto/            # Request/response DTOs
├── persistence/        # Database layer
│   ├── entity/
│   ├── enum/
│   └── interface/
├── migrations/         # TypeORM migrations (schema-scoped)
├── index.ts            # Public-API barrel (only entry point for cross-module consumers)
└── {domain}.module.ts
```

### Cross-Module Imports (mandatory)

Cross-module imports must use `@module/*` path aliases and resolve to a public-API barrel (`index.ts`). Within-module imports stay relative.

| Alias | Resolves to |
|-------|-------------|
| `@module/identity` | `src/module/identity/index.ts` |
| `@module/shared/config` | `src/shared/module/config/index.ts` |
| `@module/shared/logging` | `src/shared/module/logging/index.ts` |
| `@module/shared/mail` | `src/shared/module/mail/index.ts` |
| `@module/shared/persistence` | `src/shared/module/persistence/index.ts` |
| `@module/shared/storage` | `src/shared/module/storage/index.ts` |
| `@module/shared/image` | `src/shared/image/index.ts` |

Allowed dependency directions (enforced by dependency-cruiser):

- Domain modules → themselves, or `src/shared/*` (any shared module or library)
- `src/shared/*` → `src/shared/*` only (never a domain module)
- `src/app.module.ts` → any module (orchestrator exception)

See `docs/adr/0006-module-shared-and-path-aliases.md` for the rationale.

### Schema Isolation (mandatory)

Every domain module owns its own PostgreSQL schema. Entities must declare their schema explicitly:

```typescript
@Entity({ schema: 'identity', name: 'user' })
```

See `docs/STATE-ISOLATION.md` for full rules.

### Library Categorization

Libraries live under `libs/{scope}/{type}-{name}` where type is one of:

- **feature** — Smart components and page-level logic (e.g., `libs/books/feature-catalog`)
- **ui** — Presentational/dumb components (e.g., `libs/books/ui-card`)
- **data-access** — API clients, state management, data fetching (e.g., `libs/books/data-access`)
- **util** — Pure utilities, helpers, constants (e.g., `libs/shared/util-formatting`)

## Coding Standards

### NestJS (apps/api)

- **File naming:** kebab-case (e.g., `book-club.service.ts`)
- **Class naming:** PascalCase (e.g., `BookClubService`)
- **Organization:** Domain modules live under `src/module/{domain}/`; shared NestJS modules under `src/shared/module/{concern}/`; shared libraries (no NestJS module) under `src/shared/{library}/`
- **Pattern:** Controller → Service → Repository (TypeORM)
- **Config:** Centralized via `src/shared/module/config/` with Zod schema validation (`env.schema.ts`)
- **Email:** Via `src/shared/module/mail/` using Resend (`resend-email.service.ts`)
- **Logging:** Via `src/shared/module/logging/` using winston + nest-winston (`@module/shared/logging`)

#### Logging conventions

- Prefer structured metadata over string interpolation: `logger.info('user registered', { userId })` rather than `` logger.info(`user registered ${userId}`) ``. The redaction formatter only inspects structured fields; interpolated strings are opaque to it.
- For per-request correlation, use `req.log` (a winston child logger pre-seeded with `requestId`). Singleton-scoped loggers from `new Logger('Ctx')` do not carry `requestId` because they are constructed at class-init time.

### Test Data Setup

DB-touching tests seed rows via factories, not through production services or repositories. Each module owns its factories under `module/{domain}/__test-support__/`:

- **Shared infra (generic, no domain knowledge):** `src/shared/__test-support__/` exposes `getTestPool`, `closeTestPool`, `ensureWorkerDatabase`, `ensureSchema(name)`, `truncateTables(schema, tables)` (via the `@module/shared/test-support` alias — spec-only).
- **Identity test-support:** `module/identity/__test-support__/` exposes `createUser`, `createPasswordResetToken`, `createEmailChangeToken`, `synchronizeIdentitySchema`, the `IDENTITY_SCHEMA` / `IDENTITY_TABLES` / `IDENTITY_TEST_ENTITIES` constants, the `ensureIdentitySchema()` / `truncateIdentity()` wrappers, and `TEST_DEFAULT_PASSWORD` (via `@module/identity/test-support`). The wrappers are thin: they pass the constants into the shared primitives. Add a similar `db/` folder under every new domain.
- Factories use raw `pg` with parameterized SQL + `RETURNING`. They define local row types rather than importing entity classes — the integration suite is the parity check.
- `tsconfig.app.json` excludes `src/**/__test-support__/**`, so test-support files do not enter the production build. The `@module/.../test-support` aliases live in `tsconfig.spec.json` only.
- **Per-worker DB isolation:** a Jest `setupFile` (`src/shared/__test-support__/jest/setup-worker-db.ts`) suffixes `DB_NAME` with `_test_w${JEST_WORKER_ID}` before any test module loads. `ensureSchema()` calls `ensureWorkerDatabase()` first to `CREATE DATABASE` if missing (race-safe via `42P04`). Each worker owns an isolated database, so `truncateTables()` can't race across workers — int and e2e suites run in parallel.
- Any int/e2e spec that synchronizes the identity schema must use `IDENTITY_TEST_ENTITIES` (or include all three entities), because `truncateIdentity()` targets the full set.
- `IDENTITY_TABLES` mirrors `@Entity({ name })` and must stay in sync with the entity decorations; the factory int-specs surface drift immediately.
- The default `test` target runs unit + int only (`testPathPatterns: \\.(int-)?spec\\.ts$`). E2e runs via `test:e2e`, which sets `NODE_OPTIONS=--experimental-vm-modules` (the AWS SDK's retry path needs it; runs surface this under parallel LocalStack load).

### Next.js (apps/web)

- **Router:** App Router only
- **Components:** Server Components by default; add `"use client"` only when client interactivity is needed
- **File naming:** kebab-case for files, PascalCase for components

## Architecture Docs

Key documents in `docs/` that define project constraints:

| Document | Purpose |
|----------|---------|
| `STATE-ISOLATION.md` | Schema isolation rules per module |
| `MODULAR-PRINCIPLES.md` | Module design and dependency rules |
| `DOMAINS-DEFINITION.md` | Domain boundary definitions |
| `adr/` | Architecture Decision Records (numbered) |

Read these before making architectural changes.

## Git Workflow

### Branch Naming

```
{type}/{description}
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

Example: `feat/add-book-search`

### Commit Messages

```
{type}({scope}): {description}
```

Example: `feat(identity): add forgot password flow`

## Common Commands

```bash
# Infra
docker compose up postgres localstack -d           # Postgres + LocalStack (S3 emulator on :4566)

# Serve apps
pnpm nx serve api                                  # Backend on localhost:3333
pnpm nx serve web                                  # Frontend on localhost:4200

# Build
pnpm nx build api
pnpm nx build web
pnpm nx run-many --target=build --all

# Typecheck
pnpm nx typecheck api

# Test
pnpm nx test api                                   # Unit + int (default)
pnpm nx test api --configuration=unit              # Unit only
pnpm nx test api --configuration=int               # Integration only
pnpm nx test:e2e api                               # E2E suite (requires postgres + localstack up)
pnpm nx test web
pnpm nx run-many --target=test --all

# Generate libraries
pnpm nx g @nx/nest:library {name} --directory=libs/{scope}/{type}-{name}
pnpm nx g @nx/next:library {name} --directory=libs/{scope}/{type}-{name}

# Show projects
pnpm nx show projects

# Dependency graph
pnpm nx graph
```

## Environment Variables

See `apps/api/.env.example` for the full list. Key groups:

- **Database:** `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SYNCHRONIZE`, `DB_LOGGING`
- **Identity:** `JWT_SECRET`, `JWT_EXPIRES_IN`
- **Mail:** `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `PASSWORD_RESET_URL`, `EMAIL_CHANGE_VERIFICATION_URL`
- **Storage / S3:** `S3_REGION`, `S3_ENDPOINT` (local: LocalStack), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_AVATARS`, `S3_PUBLIC_URL_BASE`, `MAX_AVATAR_SIZE_BYTES`, `MAX_AVATAR_DIMENSION`, `AVATAR_ALLOWED_MIME`, `PRESIGNED_POST_TTL_SECONDS`
- **Logging:** `LOG_LEVEL` (`error`/`warn`/`info`/`debug`/`verbose`, default `info`), `LOG_FORMAT` (`json`/`pretty`; default `pretty` in development, `json` otherwise)
