# Plot-Twist Book Club

## Project Overview

Plot-Twist is a book club application built as an Nx monorepo. It consists of a Next.js frontend and a NestJS backend API, with shared libraries organized by scope and type.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Monorepo | Nx | 22 |
| Frontend | Next.js (App Router) | 16 |
| Backend | NestJS | 11 |
| Database | PostgreSQL | - |
| Package Manager | pnpm | latest |
| Runtime | Node.js | 22 LTS |

## Monorepo Structure

```
plot-twist/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── libs/
│   └── {scope}/
│       └── {type}-{name}/
```

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
- **Organization:** Group by domain/module (e.g., `books/`, `users/`, `clubs/`)
- **Pattern:** Controller → Service → Repository

### Next.js (apps/web)

- **Router:** App Router only
- **Components:** Server Components by default; add `"use client"` only when client interactivity is needed
- **File naming:** kebab-case for files, PascalCase for components

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

Example: `feat(books): add search endpoint`

## Common Commands

```bash
# Serve apps
pnpm nx serve api          # Backend on localhost:3000
pnpm nx serve web          # Frontend on localhost:4200

# Build
pnpm nx build api
pnpm nx build web
pnpm nx run-many --target=build --all

# Test
pnpm nx test api
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
