# Plot-Twist Project Overview

## Purpose
A book club application built as an Nx monorepo with a NestJS backend and Next.js frontend.

## Tech Stack
- **Monorepo**: Nx 22, pnpm
- **Backend**: NestJS 11 (`apps/api`) — TypeScript, TypeORM 0.3.x, PostgreSQL
- **Frontend**: Next.js 16 App Router (`apps/web`) — React 19, TypeScript
- **Runtime**: Node.js 22 LTS
- **DB**: PostgreSQL 16 via docker-compose (127.0.0.1:5432)
- **Auth**: JWT (`@nestjs/jwt`), bcrypt (12 salt rounds)

## Monorepo Structure
```
plot-twist/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── libs/             # Shared libraries (currently empty)
├── docs/
├── docker-compose.yml
├── nx.json
├── tsconfig.base.json
└── package.json
```

## API Module Structure
```
apps/api/src/
├── main.ts
├── data-source.ts          # TypeORM CLI data source
├── infra/
│   └── config/             # ConfigModule with Zod envSchema
│       └── segment/        # app.config, database.config, jwt.config
└── module/
    ├── app/                # Root AppModule
    └── identity/           # Auth module (register/login)
        ├── core/           # AuthService
        ├── http/           # Controller + DTOs
        ├── persistence/    # Entity, enum, interface
        └── migrations/
```

## Implemented Features
- Identity module: `POST /api/auth/register`, `POST /api/auth/login`
- ConfigModule with Zod validation
- Architecture fitness function tests (module isolation)
