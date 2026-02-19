# Modular Architecture Principles

Rules for keeping Plot-Twist's bounded contexts isolated, composable, and independently evolvable inside the Nx monorepo.

**Related docs:** [State Isolation](./STATE-ISOLATION.md) | [Resilience & Observability](./RESILIENCE-OBSERVABILITY.md) | [Domain Definitions](./DOMAINS-DEFINITION.md)

---

## 1. Well-Defined Boundaries

Every bounded context (Identity, Social, Clubs, Reading, Meetings) maps to a set of Nx libraries under `libs/{scope}/`. Each library exposes its public API exclusively through `index.ts` -- nothing else is importable.

```
libs/clubs/
  util-clubs/
    src/
      index.ts          <-- public API: DTOs, interfaces, enums
      lib/
        club.dto.ts     <-- NOT directly importable
```

Enforcement is automatic via the `@nx/enforce-module-boundaries` ESLint rule configured in the root `eslint.config.js`. The dependency matrix:

```
feature-*       --> data-access-*, util-*
data-access-*   --> util-*
util-*          --> shared/util-types only
Any scope       --> shared/*
```

**Rule:** If you need something from another context, import from its `util-*` library only -- never from `feature-*` or `data-access-*`.

---

## 2. Composability

Each bounded context is a self-contained NestJS module that can be composed into the application via `app.module.ts`:

```typescript
// apps/api/src/app/app.module.ts
@Module({
  imports: [
    SharedDatabaseModule,
    IdentityFeatureModule,
    SocialFeatureModule,
    ClubsFeatureModule,
    ReadingFeatureModule,
    MeetingsFeatureModule,
  ],
})
export class AppModule {}
```

Each `feature-*` module internally wires its own controllers, services, and repositories. The host application only imports the top-level module -- it never reaches into the internals.

**Rule:** A context's `feature-*` module is the only entry point for composing that context into an application.

---

## 3. Independence

Every library must be independently testable. Run tests for a single context without booting the entire application:

```bash
pnpm nx test clubs-feature-clubs
pnpm nx test reading-data-access-reading
```

Tests must never import `AppModule`. Each test module initializes only the providers it needs:

```typescript
const module = await Test.createTestingModule({
  providers: [
    ClubService,
    { provide: getRepositoryToken(ClubEntity), useValue: createMock<Repository<ClubEntity>>() },
    { provide: EventEmitter2, useValue: createMock<EventEmitter2>() },
  ],
}).compile()
```

**Rule:** If a test requires importing a module from another context to pass, the boundary is violated.

---

## 4. Individual Scale

Plot-Twist is a monolith today, but the library structure is designed for future extraction. Each bounded context owns its own:

- Database schema (see [State Isolation](./STATE-ISOLATION.md))
- Domain events (see [DOMAINS-DEFINITION.md](./DOMAINS-DEFINITION.md) section 4)
- API surface (controllers within `feature-*`)
- Test suite

When a context grows large enough to warrant extraction (e.g., Reading becomes a separate service), the extraction path is: move the `libs/{scope}/` libraries into a new `apps/` entry point and replace in-process EventEmitter2 calls with a message broker.

**Rule:** Design each context as if it could be extracted tomorrow -- even if extraction is not planned.

---

## 5. Explicit Communication

Contexts communicate through two mechanisms only:

**Shared types** via `util-*` libraries:
- DTOs, interfaces, and enums in `util-clubs/`, `util-reading/`, etc.
- Branded ID types in `shared/util-types`
- Domain event definitions in `shared/util-events`

**Domain events** via EventEmitter2:
```typescript
// In ClubsFeatureModule -- publishing
this.eventEmitter.emit('club.created', {
  clubId: club.id,
  ownerId: club.ownerId,
  name: club.name,
})

// In ReadingFeatureModule -- subscribing
@OnEvent('club.deleted')
async handleClubDeleted(payload: IClubDeletedEvent): Promise<void> {
  await this.clubReadingService.archiveAllForClub(payload.clubId)
}
```

**Cross-context references** use string IDs only -- never entity instances or repository references:
```typescript
// ClubReading entity references a club by ID, not by relation
@Column({ type: 'uuid' })
clubId: string
```

**Rule:** If you are importing a service from another context, you are violating this principle. Use events or shared types instead.

---

## 6. Replaceability

External dependencies and cross-cutting concerns are accessed through interfaces and NestJS dependency injection tokens, not concrete implementations:

```typescript
// Interface in util-reading
export interface IBookSearchProvider {
  search(query: string): Promise<IBookSearchResult[]>
}

export const BOOK_SEARCH_PROVIDER = Symbol('BOOK_SEARCH_PROVIDER')

// Implementation in data-access-reading
@Injectable()
export class GoogleBooksProvider implements IBookSearchProvider {
  async search(query: string): Promise<IBookSearchResult[]> {
    // Google Books API call
  }
}

// Registration in feature-reading
@Module({
  providers: [
    { provide: BOOK_SEARCH_PROVIDER, useClass: GoogleBooksProvider },
  ],
})
export class ReadingFeatureModule {}
```

Swapping to a different book search provider (e.g., Open Library) requires changing only the module registration -- no service code changes.

**Rule:** Any external API integration must be behind an interface with a DI token.

---

## 7. Deployment Independence

The monolith structure mirrors what independent deployments would look like:

| Current (Monolith) | Future (Extracted) |
|--------------------|--------------------|
| All `feature-*` modules in `apps/api` | Each context in its own `apps/{context}-api` |
| EventEmitter2 (in-process) | RabbitMQ / AWS SNS+SQS |
| Single PostgreSQL, schema-per-context | Separate databases per service |
| Shared `node_modules` | Independent `package.json` per service |

The Nx library structure ensures that extraction is additive (create new app, move imports) rather than surgical (untangle intertwined code).

**Rule:** Never introduce a dependency that would prevent a context from being extracted into its own deployable unit.

---

## Compliance Checklist

Before merging code that touches module boundaries:

- [ ] New libraries follow `libs/{scope}/{type}-{name}` naming
- [ ] Public API is exported only through `index.ts`
- [ ] No cross-context `feature-*` or `data-access-*` imports
- [ ] Cross-context communication uses events or shared types
- [ ] Cross-context references use string IDs, not entity relations
- [ ] External integrations are behind interfaces with DI tokens
- [ ] Tests do not import `AppModule` or modules from other contexts
- [ ] `@nx/enforce-module-boundaries` passes: `pnpm nx lint`

---

## Quick Reference

| Principle | One-Line Rule |
|-----------|---------------|
| Boundaries | Export only from `index.ts`; enforce with Nx module boundaries |
| Composability | One `feature-*` module per context; compose in `app.module.ts` |
| Independence | Every lib testable in isolation; no `AppModule` in tests |
| Individual Scale | Design for extraction even inside the monolith |
| Communication | Events + shared types only; string IDs for cross-context refs |
| Replaceability | External deps behind interfaces + DI tokens |
| Deployment | No coupling that prevents future context extraction |
