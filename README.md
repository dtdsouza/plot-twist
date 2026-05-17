# Plot-Twist: Book Club Management Platform

A modern book club management platform that helps readers organize clubs, schedule meetings, and track reading progress together.

> **Status:** Plot-Twist is a personal educational project — built to explore modern full-stack TypeScript patterns (Nx, NestJS, Next.js App Router, TypeORM, modular schema isolation). It is not production software, has no stability guarantees, and is not actively seeking contributors. You're welcome to read it, fork it, or borrow ideas.

## Features

- **Club Management**: Create and manage book clubs with friends
- **Book Tracking**: Assign books to clubs and track reading progress
- **Meeting Scheduling**: Schedule recurring meetings with Google Meet integration
- **Friend Management**: Add friends, send and accept friend requests
- **Reading History**: Track books finished across all clubs
- **User Profiles**: Customize your profile with display name, avatar, and bio

## Tech Stack

- **Frontend**: Next.js 16 (App Router)
- **Backend**: NestJS 11
- **Database**: PostgreSQL
- **Monorepo**: Nx 22
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm

## Prerequisites

- Node.js 22 LTS
- pnpm (latest)
- PostgreSQL database

## Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
# Copy .env.example to .env and configure your database connection
cp .env.example .env
```

## Running the Application

### Development

```bash
# Terminal 1: Start the backend API (runs on localhost:3333)
pnpm nx serve api

# Terminal 2: Start the frontend (runs on localhost:4200)
pnpm nx serve web
```

### Production Build

```bash
# Build all applications
pnpm nx run-many --target=build --all

# Or build individual apps
pnpm nx build api
pnpm nx build web
```

## Testing

```bash
# Run all tests
pnpm nx run-many --target=test --all

# Test specific app
pnpm nx test api
pnpm nx test web
```

## Project Structure

```
plot-twist/
├── apps/
│   ├── api/              # NestJS backend API
│   └── web/              # Next.js frontend application
├── libs/
│   └── {scope}/
│       └── {type}-{name}/  # Shared libraries organized by feature and type
├── docs/
│   └── mvp-spec.md       # MVP specification and feature documentation
└── CLAUDE.md             # Project conventions and guidelines
```

### Library Organization

Libraries are organized by scope and type:

- **feature** — Smart components and page-level logic
- **ui** — Reusable presentational components
- **data-access** — API clients and state management
- **util** — Pure utilities and helpers

Example: `libs/books/feature-catalog`, `libs/shared/ui-button`

## Common Commands

```bash
# Serve applications
pnpm nx serve api
pnpm nx serve web

# Generate a new library
pnpm nx g @nx/nest:library {name} --directory=libs/{scope}/{type}-{name}
pnpm nx g @nx/next:library {name} --directory=libs/{scope}/{type}-{name}

# View all projects
pnpm nx show projects

# View dependency graph
pnpm nx graph
```

## Contributing

Follow the conventions in [CLAUDE.md](CLAUDE.md) for:
- Branch naming: `{type}/{description}` (e.g., `feat/add-book-search`)
- Commit messages: `{type}({scope}): {description}`
- Code style and naming conventions
- Testing requirements (80% minimum coverage)

## License

MIT — see [LICENSE](LICENSE).
