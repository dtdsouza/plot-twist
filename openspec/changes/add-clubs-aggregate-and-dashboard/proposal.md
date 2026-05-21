## Why

Plot-Twist's MVP is built around clubs and the conversations inside them (DOMAINS-DEFINITION §1, §2), but BC2 (Clubs) does not exist yet — there is no schema, aggregate, or API. Without it, BC3 (Discussions) cannot be built (it consumes `ClubCreated`, `MemberJoined`, `ClubDeleted`), the web app has nothing past the auth screens, and the post-sign-up flow in `mvp-spec.md` ("lands on empty dashboard → Create Club") has no destination. DAN-9 stands up the Club aggregate so the rest of the product can land on top of it.

## What Changes

- New domain module `apps/api/src/module/clubs/` with the standard layout (`core/`, `http/{controller,dto}/`, `persistence/{entity,enum,interface}/`, `migrations/`, `clubs.module.ts`, `index.ts`). Wired into `app.module.ts` and exposed via the `@module/clubs` path alias.
- New PostgreSQL schema `clubs` with two tables created in a single migration: `clubs.club` and `clubs.membership`. `membership` is defined here even though only the owner row is written by this change — future invitation/lifecycle issues depend on the table existing.
- New `Club` aggregate root (entity + repository extending `BaseRepository`) with child `Membership` entity. Aggregate invariants (one owner, no duplicate memberships) are enforced by the service + a partial unique index on `(clubId, userId)`.
- REST endpoints under `/api/clubs`:
  - `POST /clubs` — create club; persists club + owner membership atomically.
  - `GET /clubs` — list clubs the caller belongs to (any role).
  - `GET /clubs/:id` — fetch a single club; 404 (not 403) when caller is not a member, to avoid leaking existence.
  - `PATCH /clubs/:id` — owner-only edit of `name`, `description`, `coverImageUrl`.
  - `DELETE /clubs/:id` — owner-only.
- Cover image upload reuses the avatar protocol from ADR-0009 (presigned POST → finalize):
  - `POST /clubs/:id/cover/upload-intent` — owner-only; returns presigned POST with `content-length-range` + `Content-Type` `starts-with image/` policy and key `clubs/{clubId}/cover/pending/{uploadId}`.
  - `POST /clubs/:id/cover/finalize` — owner-only; HEAD + range-GET, magic-byte sniff via `@module/shared/image`, copy pending → committed (`clubs/{clubId}/cover/{uploadId}.{ext}`), delete pending + prior cover, persist URL on `club.coverImageUrl`.
  - New env vars `S3_BUCKET_CLUB_COVERS`, `MAX_CLUB_COVER_SIZE_BYTES`, `MAX_CLUB_COVER_DIMENSION`, `CLUB_COVER_ALLOWED_MIME` validated in `env.schema.ts` and added to `.env.example`. (`S3_PUBLIC_URL_BASE` and `PRESIGNED_POST_TTL_SECONDS` are reused.)
- Web (`apps/web`) — three App Router routes under `(app)/clubs`:
  - `/(app)/clubs` — My Clubs grid: cards (cover thumbnail, name, member count, "owner" badge), "Create Club" CTA, empty-state matching `mvp-spec.md §Home / Dashboard`.
  - `/(app)/clubs/new` — Create form (name, description, optional cover image). On submit: create club → redirect to detail shell. Cover upload uses the intent/finalize flow against the new club id (i.e., create club first, then upload).
  - `/(app)/clubs/[id]` — Detail shell with the club header (name, cover, member count); chat/members/settings panels are placeholders (out of scope, owned by later DAN issues).

## Capabilities

### New Capabilities
- `clubs`: BC2 Club aggregate — schema (`clubs.club`, `clubs.membership`), CRUD endpoints, owner membership invariant, and cover-image upload via presigned POST + finalize. Domain event emission (`ClubCreated`, `MemberJoined`, `ClubDeleted`) is deferred to a follow-up issue.

### Modified Capabilities
<!-- None: no existing capability specs in openspec/specs/ that this change modifies. -->

## Impact

- **Code (API)**: New `apps/api/src/module/clubs/` (full module + migration). New TS path alias `@module/clubs` in `tsconfig.base.json` and dependency-cruiser allow rule mirroring `@module/identity`. `app.module.ts` gains `ClubsModule`. `apps/api/folderStructure.config.mjs` extended to recognize the new module shape (same template as `identity`).
- **Code (web)**: New routes under `apps/web/app/(app)/clubs/{,new,[id]}/page.tsx`. New client utility for the two-phase cover upload (mirrors the existing avatar one — opportunity to extract a shared helper, but out of scope for DAN-9).
- **APIs**: 7 new endpoints (`POST /clubs`, `GET /clubs`, `GET /clubs/:id`, `PATCH /clubs/:id`, `DELETE /clubs/:id`, `POST /clubs/:id/cover/upload-intent`, `POST /clubs/:id/cover/finalize`). All behind the existing `JwtAuthGuard`.
- **Database**: New `clubs` schema, two tables, indexes (`club.ownerId`, `membership(clubId, userId)` unique). Migration is owned by the `clubs` module; per-worker test-DB infra picks it up automatically.
- **Storage**: New S3 bucket `S3_BUCKET_CLUB_COVERS` (LocalStack-provisioned for dev/test). Lifecycle rule on `cover/pending/*` (1-day expiry) — declared in the LocalStack init script alongside the avatars rule.
- **Env / config**: 4 new env vars (size/dimension/MIME/bucket for club covers). Documented in `apps/api/.env.example` and the env table in `CLAUDE.md`.
- **Test-support**: New `apps/api/src/module/clubs/__test-support__/` with `createClub`, `createMembership`, `synchronizeClubsSchema`, `ensureClubsSchema()`, `truncateClubs()`, plus the matching constants (`CLUBS_SCHEMA`, `CLUBS_TABLES`, `CLUBS_TEST_ENTITIES`). Spec-only `@module/clubs/test-support` alias in `tsconfig.spec.json`.
- **Dependencies**: None new on the API; no web-side deps.
- **Out of scope**:
  - Domain event emission (`ClubCreated`, `MemberJoined`, `ClubDeleted`) and the `@nestjs/event-emitter` integration — postponed to a dedicated follow-up issue when Discussions / Notifications consumers materialize.
  - Invitations (targeted + shareable link) — own DAN issue.
  - Member roles beyond `owner` / `member`, role transitions, ownership transfer.
  - Discussions integration (event consumer side) — owned by BC3 work.
  - `(app)/clubs/[id]` real content (chat, members panel, settings panel) — only the shell renders here.
  - A shared two-phase-upload client helper across avatars and club covers — duplication is acceptable for now.
