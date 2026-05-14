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
│   │   └── src/
│   │       ├── data-source.ts        # TypeORM data source config (CLI entrypoint)
│   │       ├── main.ts
│   │       └── module/               # Every NestJS module (domain + shared support)
│   │           ├── app/              # Root app module (orchestrator)
│   │           ├── identity/         # Domain: auth, users, password reset
│   │           └── shared/           # Cross-cutting support modules
│   │               ├── config/       # Centralized env config (Zod-validated)
│   │               ├── mail/         # Resend email service
│   │               ├── typeorm/      # BaseEntity, BaseRepository, TypeormPersistenceModule
│   │               ├── persistence/  # DataSourceOptions builder + PersistenceModule
│   │               ├── storage/      # Generic S3 storage client (presigned POST, HEAD, copy, delete)
│   │               └── image/        # Image-format utilities (magic-byte sniffing)
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

All NestJS modules live under `apps/api/src/module/`. There are three kinds:

| Kind | Location | Purpose |
|------|----------|---------|
| Orchestrator | `module/app/` | Root `AppModule`; composes domain + shared modules |
| Domain | `module/{domain}/` (e.g., `identity/`) | A bounded context with its own schema |
| Shared | `module/shared/{concern}/` | Cross-cutting support (config, mail, typeorm, persistence, storage, image) |

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
| `@module/shared/config` | `src/module/shared/config/index.ts` |
| `@module/shared/mail` | `src/module/shared/mail/index.ts` |
| `@module/shared/typeorm` | `src/module/shared/typeorm/index.ts` |
| `@module/shared/persistence` | `src/module/shared/persistence/index.ts` |
| `@module/shared/storage` | `src/module/shared/storage/index.ts` |
| `@module/shared/image` | `src/module/shared/image/index.ts` |

Allowed dependency directions (enforced by dependency-cruiser):

- Domain modules → themselves, or `module/shared/*` (any sub-module)
- `module/shared/*` → `module/shared/*` only (never a domain module)
- `module/app/` → any module (orchestrator exception)

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
- **Organization:** Every NestJS module lives under `module/` — domains as `module/{domain}/`, cross-cutting concerns as `module/shared/{concern}/`
- **Pattern:** Controller → Service → Repository (TypeORM)
- **Config:** Centralized via `module/shared/config/` with Zod schema validation (`env.schema.ts`)
- **Email:** Via `module/shared/mail/` using Resend (`resend-email.service.ts`)

### Test Data Setup

DB-touching tests seed rows via factories, not through production services or repositories. Each module owns its factories under `module/{domain}/__test-support__/`:

- **Shared infra:** `module/shared/__test-support__/` exposes `getTestPool`, `closeTestPool`, `ensureIdentitySchema`, `truncateIdentity` (via the `@module/shared/test-support` alias — spec-only).
- **Identity factories:** `module/identity/__test-support__/` exposes `createUser`, `createPasswordResetToken`, `createEmailChangeToken`, `synchronizeIdentitySchema`, plus the `TEST_DEFAULT_PASSWORD` constant (via `@module/identity/test-support`).
- Factories use raw `pg` with parameterized SQL + `RETURNING`. They define local row types rather than importing entity classes — the integration suite is the parity check.
- `tsconfig.app.json` excludes `src/**/__test-support__/**`, so test-support files do not enter the production build. The `@module/.../test-support` aliases live in `tsconfig.spec.json` only.
- Integration tests run serially (`runInBand`) because all specs share `truncateIdentity()`; cross-worker truncate would race.

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
