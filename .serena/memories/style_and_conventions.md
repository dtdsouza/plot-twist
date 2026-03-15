# Code Style and Conventions

## TypeScript Naming
| Entity       | Pattern          | Example                    |
|--------------|------------------|----------------------------|
| Variables    | camelCase        | `const userName`           |
| Functions    | camelCase (verb) | `function fetchData()`     |
| Classes      | PascalCase       | `class UserRepository`     |
| Interfaces   | IPascalCase      | `interface IUserData`      |
| Types        | TPascalCase      | `type TUserResponse`       |
| Enums        | EPascalCase      | `enum EUserStatus`         |
| Constants    | UPPER_SNAKE_CASE | `const MAX_RETRY_COUNT`    |

## File Naming
| Type            | Pattern          | Example                        |
|-----------------|------------------|--------------------------------|
| Controllers     | .controller.ts   | `auth.controller.ts`           |
| Services        | .service.ts      | `auth.service.ts`              |
| Modules         | .module.ts       | `identity.module.ts`           |
| Entities        | .entity.ts       | `user.entity.ts`               |
| DTOs            | .dto.ts          | `register.dto.ts`              |
| Unit Tests      | .spec.ts         | `auth.service.spec.ts`         |
| Integration     | .int-spec.ts     | `auth.service.int-spec.ts`     |
| E2E Tests       | .e2e-spec.ts     | `auth.controller.e2e-spec.ts`  |
| All files       | kebab-case       |                                |

## Test File Location
Tests live in `__tests__/` folders inside each module directory.

## Module Organization
Domain-driven: `src/module/{domain}/` with subdirs:
- `core/` — services/business logic
- `http/` — controllers, DTOs
- `persistence/` — entities, enums, interfaces
- `migrations/` — TypeORM migrations

## Key Patterns
- **Immutability**: Never mutate objects; always spread
- **Guard clauses**: Early returns over deep nesting
- **No console.log**: Use NestJS Logger instead
- **Error handling**: Throw NestJS HttpException subclasses
- **Input validation**: class-validator decorators on DTOs
- **Config**: ConfigModule with Zod envSchema (`apps/api/src/infra/config/env.schema.ts`)
- **DB schema isolation**: Each module uses its own PostgreSQL schema (e.g., `identity`)

## tsconfig Notes
- Root: `module: nodenext` (tsconfig.base.json)
- Tests: `module: commonjs, moduleResolution: node` (tsconfig.spec.json) — needed for ts-jest compatibility
- Jest config must be `.js` (not `.ts`) due to nodenext conflict with ts-node
