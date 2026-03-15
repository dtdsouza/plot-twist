# Suggested Commands

## Running Apps
```bash
pnpm nx serve api          # Backend on localhost:3000
pnpm nx serve web          # Frontend on localhost:4200
docker compose up postgres -d   # Start PostgreSQL DB
```

## Building
```bash
pnpm nx build api
pnpm nx build web
pnpm nx run-many --target=build --all
```

## Testing
```bash
pnpm nx test api           # Run all API tests via Nx
pnpm nx test web

# Direct Jest (more control)
npx jest --config apps/api/jest.config.js --testPathPatterns="\.spec\.ts$" --coverage
npx jest --config apps/api/jest.config.js --forceExit --runInBand   # all tests

# Test categories
npm run test:unit          # Unit tests only
npm run test:int           # Integration tests (needs DB)
npm run test:e2e           # E2E tests (needs full env)
```

## Code Quality
```bash
pnpm nx lint api
pnpm nx lint web
```

## Nx Utilities
```bash
pnpm nx show projects      # List all projects
pnpm nx graph              # Dependency graph

# Generate libraries
pnpm nx g @nx/nest:library {name} --directory=libs/{scope}/{type}-{name}
pnpm nx g @nx/next:library {name} --directory=libs/{scope}/{type}-{name}
```

## Database Migrations (TypeORM CLI)
```bash
# Uses apps/api/src/data-source.ts
npx typeorm migration:run -d apps/api/src/data-source.ts
npx typeorm migration:generate -d apps/api/src/data-source.ts -n MigrationName
```

## System Utilities
```bash
git, ls, cd, grep, find    # Standard Linux utilities
```
