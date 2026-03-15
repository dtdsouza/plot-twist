# Task Completion Checklist

When a task is done, verify the following before considering it complete:

## Code Quality
- [ ] No `console.log` — use NestJS Logger
- [ ] No hardcoded secrets — use ConfigService / env vars
- [ ] No object mutation — use spread/immutable patterns
- [ ] Functions < 50 lines, files < 800 lines
- [ ] Naming follows conventions (IPascalCase interfaces, EPascalCase enums, etc.)
- [ ] Proper error handling with HttpException subclasses

## Tests
- [ ] Tests written first (TDD: RED → GREEN → REFACTOR)
- [ ] Unit tests in `__tests__/*.spec.ts`
- [ ] Integration tests in `__tests__/*.int-spec.ts` (if DB/service interaction)
- [ ] E2E tests in `__tests__/*.e2e-spec.ts` (if new endpoints)
- [ ] Coverage ≥ 80% (branches ≥ 78% due to decorator metadata)
- [ ] Run: `npx jest --config apps/api/jest.config.js --forceExit --runInBand`

## TypeScript
- [ ] No type errors: `pnpm nx build api` or `tsc --noEmit`
- [ ] Lint passes: `pnpm nx lint api`

## Git
- [ ] Conventional commit: `feat(scope): description`
- [ ] Branch named: `{type}/{description}` (e.g., `feat/add-book-search`)
- [ ] No `.env` files committed

## Integration-test specific
- [ ] Create schema before TypeORM synchronize: `CREATE SCHEMA IF NOT EXISTS {schema}`
- [ ] Use `127.0.0.1` (not `localhost`) for DB connections — localhost resolves to ::1 on this host
- [ ] Close DB connections in `afterAll`
