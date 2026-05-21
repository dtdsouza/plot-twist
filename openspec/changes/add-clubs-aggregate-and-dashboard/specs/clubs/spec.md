## ADDED Requirements

### Requirement: Clubs schema and tables

The API SHALL own a PostgreSQL schema named `clubs` containing at least two tables created in a single migration: `clubs.club` and `clubs.membership`. Every entity in the module MUST declare `@Entity({ schema: 'clubs', name: <table> })` per STATE-ISOLATION Rule 1.

`clubs.club` MUST contain at minimum: `id` (uuid, primary key, application-generated per ADR-0005), `name` (varchar, not null), `description` (text, nullable), `ownerId` (uuid, not null — references identity by id without a FK or JOIN, per STATE-ISOLATION Rule 2), `coverImageUrl` (text, nullable), `createdAt` (timestamptz, not null), `updatedAt` (timestamptz, not null).

`clubs.membership` MUST contain at minimum: `id` (uuid, primary key), `clubId` (uuid, not null, FK to `clubs.club.id` ON DELETE CASCADE), `userId` (uuid, not null — no FK), `role` (text, not null, one of `owner` / `member`), `joinedAt` (timestamptz, not null). A unique constraint on `(clubId, userId)` MUST exist to enforce the "no duplicate memberships" invariant. An index on `userId` SHALL exist to support `GET /clubs`.

#### Scenario: Schema and tables exist after migration

- **WHEN** the `clubs` migration runs against an empty database
- **THEN** schema `clubs` exists with tables `club` and `membership`, the unique constraint on `(clubId, userId)` exists, and the index on `membership.userId` exists

#### Scenario: Entity decoration enforces schema

- **WHEN** any entity in `module/clubs/persistence/entity/` is loaded
- **THEN** its `@Entity` decorator declares `schema: 'clubs'` and an explicit `name`

### Requirement: Create club persists owner membership atomically

The API SHALL expose `POST /api/clubs` (JWT-guarded) which accepts `{ name, description? }` and creates a club whose `ownerId` is the caller. In the same database transaction, the API MUST insert one `clubs.membership` row with `role = 'owner'` and `userId = caller.id`. If either insert fails, the entire transaction MUST roll back. The response status MUST be `201` with the created club in the body.

#### Scenario: Successful creation

- **WHEN** an authenticated user `u_1` POSTs `{ name: "Book Worms", description: "..." }` to `/api/clubs`
- **THEN** the response is `201`, a row exists in `clubs.club` with `ownerId = u_1`, and a row exists in `clubs.membership` with `clubId = <new>`, `userId = u_1`, `role = 'owner'`

#### Scenario: Rollback on membership insert failure

- **WHEN** the membership insert fails for any reason (e.g., simulated DB error)
- **THEN** no row remains in `clubs.club` for that request

#### Scenario: Validation rejects empty name

- **WHEN** an authenticated user POSTs `{ name: "" }` to `/api/clubs`
- **THEN** the response is `400` and no rows are persisted

### Requirement: List the caller's clubs

The API SHALL expose `GET /api/clubs` (JWT-guarded) which returns the clubs the calling user has a `clubs.membership` row in, regardless of role. The response MUST include each club's `id`, `name`, `description`, `coverImageUrl`, `createdAt`, and the caller's `role` in that club. Clubs the caller is not a member of MUST NOT appear.

#### Scenario: Returns only the caller's clubs

- **WHEN** user `u_1` is an `owner` of club `A` and a `member` of club `B`, and `u_2` owns club `C`; `u_1` calls `GET /api/clubs`
- **THEN** the response is `200` with exactly two clubs (`A` with `role: 'owner'`, `B` with `role: 'member'`); club `C` is absent

#### Scenario: Empty list for users with no memberships

- **WHEN** a freshly registered user with no memberships calls `GET /api/clubs`
- **THEN** the response is `200` with an empty array

### Requirement: Fetch single club requires membership

The API SHALL expose `GET /api/clubs/:id` (JWT-guarded). The caller MUST have a `clubs.membership` row for `:id` to receive the club. Non-members SHALL receive `404` (not `403`) to avoid leaking the existence of clubs they cannot see.

#### Scenario: Member sees the club

- **WHEN** user `u_1` is a member of club `A` and calls `GET /api/clubs/A`
- **THEN** the response is `200` with the club's `id`, `name`, `description`, `coverImageUrl`, and the caller's `role`

#### Scenario: Non-member gets 404

- **WHEN** user `u_2` is not a member of club `A` and calls `GET /api/clubs/A`
- **THEN** the response is `404`

#### Scenario: Unknown id gets 404

- **WHEN** any authenticated user calls `GET /api/clubs/<random-uuid>` with no matching row
- **THEN** the response is `404`

### Requirement: Update club requires owner role

The API SHALL expose `PATCH /api/clubs/:id` (JWT-guarded) accepting partial `{ name?, description?, coverImageUrl? }`. The caller MUST hold `role = 'owner'` in `clubs.membership` for `:id`. Non-owners (including non-owner members and non-members) SHALL receive `403`.

`coverImageUrl` MUST only be writable through the finalize endpoint; `PATCH` MUST reject explicit changes to `coverImageUrl` from clients (i.e., the field is read-only via this endpoint).

#### Scenario: Owner updates name

- **WHEN** owner `u_1` PATCHes `/api/clubs/A` with `{ name: "New Name" }`
- **THEN** the response is `200`, `clubs.club.name` is `"New Name"`, and `updatedAt` is bumped

#### Scenario: Non-owner member is rejected

- **WHEN** member-but-not-owner `u_2` PATCHes `/api/clubs/A`
- **THEN** the response is `403` and no rows change

#### Scenario: PATCH rejects cover URL writes

- **WHEN** any caller PATCHes `/api/clubs/A` with `{ coverImageUrl: "https://..." }`
- **THEN** the response is `400` and `clubs.club.coverImageUrl` is unchanged

### Requirement: Delete club requires owner role

The API SHALL expose `DELETE /api/clubs/:id` (JWT-guarded). The caller MUST hold `role = 'owner'` for `:id`. On success, the club row is removed (membership rows cascade) and the response is `204`.

#### Scenario: Owner deletes club

- **WHEN** owner `u_1` DELETEs `/api/clubs/A`
- **THEN** the response is `204` and no rows for club `A` remain in `clubs.club` or `clubs.membership`

#### Scenario: Non-owner is rejected

- **WHEN** member-but-not-owner `u_2` DELETEs `/api/clubs/A`
- **THEN** the response is `403` and the club still exists

### Requirement: Club aggregate invariants

The system SHALL enforce the following invariants on the Club aggregate at all times:

1. **Exactly one owner per club.** Every persisted `clubs.club` row MUST have at least one `clubs.membership` row with `role = 'owner'` for the same `clubId`. This is established at creation time (Requirement: Create club persists owner membership atomically) and cannot be lowered to zero by any operation introduced in this change.
2. **No duplicate memberships.** A `(clubId, userId)` pair MUST be unique across `clubs.membership`. Attempts to insert a duplicate MUST be rejected by the unique index.

#### Scenario: Duplicate membership insert is rejected

- **WHEN** code attempts to insert a second `clubs.membership` row for the same `(clubId, userId)` (including via test factories)
- **THEN** the database rejects the insert with a unique-constraint violation

### Requirement: Cover image upload via presigned POST and finalize

The API SHALL implement cover-image upload using the two-phase protocol from ADR-0009, mirroring the avatar flow.

`POST /api/clubs/:id/cover/upload-intent` (JWT-guarded, owner-only) MUST accept `{ contentType, contentLength }`, validate them against `CLUB_COVER_ALLOWED_MIME` and `MAX_CLUB_COVER_SIZE_BYTES`, mint `uploadId = randomUUID()`, and return a presigned POST whose policy declares `content-length-range` matching `MAX_CLUB_COVER_SIZE_BYTES` and `Content-Type` `starts-with image/`. The staging key MUST be `clubs/{clubId}/cover/pending/{uploadId}` in bucket `S3_BUCKET_CLUB_COVERS`.

`POST /api/clubs/:id/cover/finalize` (JWT-guarded, owner-only) MUST accept the staging key, assert it begins with `clubs/{clubId}/cover/pending/`, HEAD the object, fetch the first 4 KB, run magic-byte sniffing via `@module/shared/image`, validate the dimensions against `MAX_CLUB_COVER_DIMENSION`, copy the object to `clubs/{clubId}/cover/{uploadId}.{ext}`, best-effort delete the pending object and the prior cover, and persist the new public URL on `club.coverImageUrl`.

#### Scenario: Owner uploads a valid JPEG cover

- **WHEN** owner `u_1` calls intent → uploads to the returned URL → calls finalize with the staging key
- **THEN** `clubs.club.coverImageUrl` is set to the committed public URL, the staging object is deleted, and `coverImageUrl` is reflected in the next `GET /api/clubs/:id`

#### Scenario: Non-owner is rejected at intent

- **WHEN** a non-owner member calls `POST /api/clubs/:id/cover/upload-intent`
- **THEN** the response is `403` and no presigned URL is issued

#### Scenario: Cross-club key is rejected at finalize

- **WHEN** owner `u_1` of club `A` calls `POST /api/clubs/A/cover/finalize` with a staging key that does NOT start with `clubs/A/cover/pending/`
- **THEN** the response is `400`/`403` (implementation chooses) and `clubs.club.coverImageUrl` is unchanged

#### Scenario: Disguised non-image file is rejected at finalize

- **WHEN** the staging object is a renamed executable whose magic bytes are not in the allow-list
- **THEN** finalize responds `400`, the pending object is deleted, and `coverImageUrl` is unchanged

### Requirement: Club cover env vars validated at boot

The shared config (`apps/api/src/shared/module/config/env.schema.ts`) SHALL validate the following env vars and the API MUST fail to boot when any are missing or malformed:

- `S3_BUCKET_CLUB_COVERS` — non-empty string
- `MAX_CLUB_COVER_SIZE_BYTES` — positive integer
- `MAX_CLUB_COVER_DIMENSION` — positive integer (pixels, applied to both width and height)
- `CLUB_COVER_ALLOWED_MIME` — comma-separated list of MIME types, each matching `^image/`

`S3_PUBLIC_URL_BASE` and `PRESIGNED_POST_TTL_SECONDS` are reused from the avatar configuration.

#### Scenario: Missing bucket var fails boot

- **WHEN** the API starts without `S3_BUCKET_CLUB_COVERS` set
- **THEN** boot fails with a Zod validation error before the Nest app is created

#### Scenario: Non-image MIME entry rejected

- **WHEN** the API starts with `CLUB_COVER_ALLOWED_MIME=image/jpeg,application/pdf`
- **THEN** boot fails with a Zod validation error

### Requirement: Web My Clubs dashboard

The web app SHALL expose route `/(app)/clubs` ("My Clubs") that lists the authenticated user's clubs. Each card MUST show the cover thumbnail (or a default placeholder when `coverImageUrl` is null), the club name, and an `"owner"` badge when the caller's role is `owner`. The route MUST surface a "Create Club" call-to-action that links to `/(app)/clubs/new`. When the caller has no memberships, the route MUST render an empty state that matches `docs/mvp-spec.md §Home / Dashboard` (welcome copy + prominent Create Club CTA).

#### Scenario: User with clubs

- **WHEN** the authenticated user has two clubs (one owned, one joined) and visits `/(app)/clubs`
- **THEN** two cards render, the owned card carries the `owner` badge, and the Create Club CTA is present

#### Scenario: User with no clubs

- **WHEN** the authenticated user has no memberships and visits `/(app)/clubs`
- **THEN** the empty-state copy renders with the Create Club CTA as the primary action

### Requirement: Web Create Club form

The web app SHALL expose route `/(app)/clubs/new` with a form containing `name` (required), `description` (optional), and `coverImage` (optional file input). Submitting the form MUST call `POST /api/clubs` first; on success, if a cover file was selected, the client MUST run the two-phase upload (intent → S3 POST → finalize) against the newly created club id and then navigate to `/(app)/clubs/{id}`. If only the club is created (no cover) the client navigates to `/(app)/clubs/{id}` as soon as the create succeeds.

#### Scenario: Create with cover

- **WHEN** the user fills name + description, selects a JPEG cover, and submits
- **THEN** the browser shows the new club at `/(app)/clubs/{id}` and the cover is visible after the finalize call returns

#### Scenario: Create without cover

- **WHEN** the user fills only the required name and submits
- **THEN** the browser navigates to `/(app)/clubs/{id}` and the cover slot renders the default placeholder

#### Scenario: Validation error preserves input

- **WHEN** the user submits with an empty name
- **THEN** the client shows an inline error, no `POST /api/clubs` is issued, and no navigation occurs

### Requirement: Web Club Detail shell

The web app SHALL expose route `/(app)/clubs/[id]` rendering at minimum the club header (cover image or placeholder, name, member count). Panels for chat, members, and settings MAY be placeholders for this change. The route MUST render a 404 when `GET /api/clubs/:id` returns `404`.

#### Scenario: Member visits detail

- **WHEN** a member of club `A` visits `/(app)/clubs/A`
- **THEN** the header (cover, name, member count) renders

#### Scenario: Non-member sees 404

- **WHEN** a non-member visits `/(app)/clubs/A`
- **THEN** the route renders the app's 404 page
