## 1. Aliases, Project Structure, and Config

- [x] 1.1 Add `@module/clubs` and `@module/clubs/test-support` path aliases to `tsconfig.base.json` (the latter only in `tsconfig.spec.json`); mirror the identity entries
- [x] 1.2 Extend `apps/api/folderStructure.config.mjs` to recognize `module/clubs/` with the same internal layout as `module/identity/`; run `pnpm nx lint api` to confirm no project-structure violations
- [x] 1.3 Update dependency-cruiser rules so `module/clubs/*` can import `shared/*` and is itself importable only via `@module/clubs`; verify identity → clubs and clubs → identity imports are forbidden
- [x] 1.4 Extend `apps/api/src/shared/module/config/env.schema.ts` with `S3_BUCKET_CLUB_COVERS`, `MAX_CLUB_COVER_SIZE_BYTES` (positive int), `MAX_CLUB_COVER_DIMENSION` (positive int), `CLUB_COVER_ALLOWED_MIME` (comma-list, each `^image/`); fail boot on invalid values
- [x] 1.5 Update `apps/api/.env.example` with the four new vars and short comments
- [x] 1.6 Update `CLAUDE.md` env-vars table under "Storage / S3" with the new vars

## 2. Clubs Module — Scaffolding

- [x] 2.1 Create `apps/api/src/module/clubs/` with `core/`, `http/{controller,dto}/`, `persistence/{entity,enum,interface,repository}/`, `migrations/`, `__test-support__/`, `core/__tests__/`, `http/controller/__tests__/`
- [x] 2.2 Add `clubs.module.ts` wiring `TypeOrmModule.forFeature([ClubEntity, MembershipEntity])`, `StorageModule`, and `ConfigModule` as needed
- [x] 2.3 Add `index.ts` barrel exporting `ClubsModule` only (event constants/payloads are deferred to the follow-up issue)
- [x] 2.4 Register `ClubsModule` in `app.module.ts`

## 3. Entities, Enums, Migration

- [x] 3.1 Add `EMembershipRole` enum (`owner`, `member`) under `persistence/enum/`
- [x] 3.2 Implement `ClubEntity` extending `BaseEntity` with `@Entity({ schema: 'clubs', name: 'club' })`: `name` (varchar 100), `description` (text nullable), `ownerId` (uuid), `coverImageUrl` (text nullable). Indexes: `ownerId`
- [x] 3.3 Implement `MembershipEntity` extending `BaseEntity` with `@Entity({ schema: 'clubs', name: 'membership' })`: `clubId` (uuid, FK to `clubs.club` ON DELETE CASCADE, `@ManyToOne` within schema OK), `userId` (uuid, no FK), `role` (enum), `joinedAt` (timestamptz). Unique index on `(clubId, userId)`; non-unique index on `userId`
- [x] 3.4 Write migration `migrations/<ts>-create-clubs-schema-and-tables.ts`: `CREATE SCHEMA IF NOT EXISTS clubs`, both tables, enum type, indexes, unique constraint. Implement `down()` to drop everything in reverse order
- [x] 3.5 Add repositories `ClubRepository` and `MembershipRepository` extending `BaseRepository`; expose `findByIdForMember(clubId, userId)`, `listByMember(userId)`, `existsOwnership(clubId, userId)`, `insertWithOwner(...)` (transactional helper) as needed

## 4. Core Services

- [x] 4.1 Implement `ClubService.create(ownerId, dto)` — opens a `DataSource.transaction`, inserts club + owner membership, commits, and returns the club. Leave a clearly-marked comment at the post-commit point reserving the seam for future event emission
- [x] 4.2 Implement `ClubService.listForMember(userId)` returning each club with the caller's role (computed via join in repository)
- [x] 4.3 Implement `ClubService.findByIdForMember(clubId, userId)` — returns club + caller role; throws `NotFoundException` for non-members and unknown ids
- [x] 4.4 Implement `ClubService.updateAsOwner(clubId, userId, dto)` — verifies owner role, applies `name` / `description` only, rejects `coverImageUrl` writes (DTO whitelist), bumps `updatedAt`
- [x] 4.5 Implement `ClubService.deleteAsOwner(clubId, userId)` — verifies owner role, deletes (cascade)
- [x] 4.6 Implement `ClubCoverService` consuming `StorageClient` and `@module/shared/image`: `requestUploadIntent(clubId, ownerId, contentType, contentLength)` and `finalize(clubId, ownerId, stagingKey)` mirroring `AvatarService`. Key scheme: `clubs/{clubId}/cover/pending/{uploadId}` → `clubs/{clubId}/cover/{uploadId}.{ext}`

## 5. HTTP Layer — DTOs, Guards, Controller

- [x] 5.1 DTOs under `http/dto/`: `CreateClubDto` (`name` required string ≤100, `description` optional string ≤2000), `UpdateClubDto` (partial of name/description; `@Allow` excludes `coverImageUrl`), `UploadCoverIntentDto` (`contentType` matches `^image/`, `contentLength` int ≤ env max), `FinalizeCoverDto` (`key` string starting with `clubs/{:id}/cover/pending/`)
- [x] 5.2 Implement `ClubsController` (`@Controller('clubs')` under existing `JwtAuthGuard`): `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/cover/upload-intent`, `POST /:id/cover/finalize`. Status codes: 201 / 200 / 200 / 200 / 204 / 200 / 200
- [x] 5.3 Implement an `OwnerGuard` (or inline check in service — pick one; service-side is simpler and easier to unit-test): non-owners receive `ForbiddenException` from update/delete/cover endpoints
- [x] 5.4 Wire controller into `ClubsModule.controllers`

## 6. Test Support

- [x] 6.1 Create `apps/api/src/module/clubs/__test-support__/db/` with `CLUBS_SCHEMA`, `CLUBS_TABLES`, `CLUBS_TEST_ENTITIES` constants and a `synchronizeClubsSchema()` helper following the identity pattern
- [x] 6.2 Add `ensureClubsSchema()` and `truncateClubs()` wrappers that delegate to the generic primitives in `@module/shared/test-support`
- [x] 6.3 Add raw-pg factories: `createClub({ ownerId, name?, description?, coverImageUrl? })`, `createMembership({ clubId, userId, role?, joinedAt? })`. Each defines a local row type and uses `RETURNING *`
- [x] 6.4 Export the helpers + constants from `__test-support__/index.ts`; ensure the `@module/clubs/test-support` alias resolves only in `tsconfig.spec.json`
- [x] 6.5 Confirm `tsconfig.app.json` excludes `src/module/clubs/**/__test-support__/**` so it never enters the production build

## 7. API Tests

- [x] 7.1 Unit spec `core/__tests__/club.service.spec.ts` — DI-mocked repositories; covers create-transaction (rollback assertion via mocked `transaction(() => fn)`), list, find, update, delete
- [x] 7.2 Unit spec `core/__tests__/club-cover.service.spec.ts` — mocks `StorageClient` and `@module/shared/image` sniffer; covers intent allow-list, finalize key-prefix assertion, magic-byte rejection, success path
- [x] 7.3 Int spec `core/__tests__/club.service.int-spec.ts` — real DB; asserts atomic create (no orphan rows on failure), `listForMember` selectivity, `findByIdForMember` 404 for non-member, and the global invariant: for every `clubs.club` row, exactly one `clubs.membership` row with `role='owner'` and matching `userId` exists
- [x] 7.4 Int spec for the unique `(clubId, userId)` index — asserts duplicate-membership insert via factory raises a Postgres unique-violation
- [x] 7.5 E2E spec `__tests__/clubs.controller.e2e-spec.ts` — exercises every endpoint with real JWTs; verifies 404 (not 403) for non-member `GET /:id`, 403 for non-owner `PATCH/DELETE`, and 400 when `PATCH` includes `coverImageUrl`
- [x] 7.6 E2E spec for the cover flow — uses LocalStack, walks `intent → S3 POST → finalize`, asserts `coverImageUrl` updates, pending object deleted, prior cover deleted on second upload
- [x] 7.7 Run `pnpm nx test api` (unit + int) and `pnpm nx test:e2e api` (requires `docker compose up postgres localstack -d`); confirm green

## 8. Web — My Clubs, Create, Detail Shell

- [x] 8.1 Add an API client helper for clubs: `listClubs()`, `getClub(id)`, `createClub(dto)`, `updateClub(id, dto)`, `deleteClub(id)`, `requestCoverIntent(id, file)`, `finalizeCover(id, key)`. Wire JWT from existing auth context
- [x] 8.2 Implement `/(app)/clubs/page.tsx` — server-fetches `listClubs()`, renders the grid + empty-state per `mvp-spec.md §Home / Dashboard`; "Create Club" CTA links to `/clubs/new`
- [x] 8.3 Add a `ClubCard` UI component (cover thumbnail with default placeholder, name, `owner` badge when applicable)
- [x] 8.4 Implement `/(app)/clubs/new/page.tsx` — client component with form (name required, description optional, optional cover file). Submit sequence: `createClub` → if file: `intent → S3 POST → finalize` → `router.push('/clubs/{id}')`
- [x] 8.5 Surface upload errors in the create flow: cover failure does not block club creation; show a non-blocking toast "Cover upload failed — you can retry from the club settings later"
- [x] 8.6 Implement `/(app)/clubs/[id]/page.tsx` — server-fetches the club, renders header (cover or placeholder, name, member count), reserves slots for chat/members/settings as placeholders. 404 when the API returns 404
- [x] 8.7 Add the bundled default cover placeholder asset under `apps/web/public/` and reference it from `ClubCard` + detail header
- [ ] 8.8 Run `pnpm nx serve api` + `pnpm nx serve web` and walk the flow in a browser: sign up → empty dashboard → Create Club → see the club shell

## 9. Verification & Cleanup

- [x] 9.1 `pnpm nx typecheck api` and `pnpm nx typecheck web` pass
- [x] 9.2 `pnpm nx lint api` and `pnpm nx lint web` pass; dependency-cruiser reports no violations
- [x] 9.3 `pnpm nx test api`, `pnpm nx test:e2e api`, `pnpm nx test web` — all green; identity-module specs remain green (no regressions)
- [x] 9.4 Update `CLAUDE.md` "Identity Module (implemented)" section style: add a "Clubs Module (implemented)" subsection listing the schema and endpoints; note that event emission is deferred
- [ ] 9.5 Manually verify in LocalStack: a successful cover upload lands at the committed key, the staging object is gone, and a tab-close mid-upload leaves only a `cover/pending/*` object reachable by the lifecycle rule
- [x] 9.6 Run `openspec validate add-clubs-aggregate-and-dashboard --strict` and address any errors before archiving
