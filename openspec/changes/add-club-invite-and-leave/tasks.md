## 1. Config

- [x] 1.1 Add `CLUB_INVITE_URL` (url, default `http://localhost:4200/clubs/join`) and `CLUB_INVITE_EXPIRY_DAYS` (positive int, default `14`) to `apps/api/src/shared/module/config/env.schema.ts`; fail boot on invalid values
- [x] 1.2 Add a `clubsConfig` segment under `shared/module/config/segment` exporting `CLUBS_CONFIG_KEY` and `IClubsConfig`; re-export both from the config barrel `index.ts`
- [x] 1.3 Update `apps/api/.env.example` with the two new vars and short comments
- [x] 1.4 Update root `CLAUDE.md`: env-vars table and the Clubs Module section (new endpoints, `club_invite` table, invite/join/leave flows)

## 2. Persistence — Entity, Repository, Migration

- [x] 2.1 Add `ClubInviteEntity` (`@Entity({ schema: 'clubs', name: 'club_invite' })`) extending `BaseEntity`: `clubId` (uuid), `token` (varchar, unique index), `createdByUserId` (uuid), `expiresAt` (timestamptz, nullable), `revokedAt` (timestamptz, nullable); index on `clubId`
- [x] 2.2 Add `ClubInviteRepository extends BaseRepository<ClubInviteEntity>` with `findActiveByClub(clubId)`, `findActiveByToken(token)`, `revokeActiveForClub(manager, clubId)`, and an insert helper; "active" = `revokedAt IS NULL` and not past `expiresAt`
- [x] 2.3 Extend `MembershipRepository` with `removeMembership(clubId, userId)` and a `member`-role insert helper (or transactional join helper); reuse `findRoleForUser` / `existsOwnership`
- [x] 2.4 Write migration `migrations/<ts>-create-club-invite-table.ts`: `CREATE TABLE clubs.club_invite (...)`, unique index on `token`, index on `clubId`; implement `down()` to drop the table. No changes to `club` / `membership`
- [x] 2.5 Register `ClubInviteEntity` in `TypeOrmModule.forFeature([...])` in `clubs.module.ts` and provide the new repository

## 3. Core Services

- [x] 3.1 Implement `ClubInviteService.getOrCreateActive(clubId, ownerId)` — verify ownership, return active invite or transactionally create one with `expiresAt = now + CLUB_INVITE_EXPIRY_DAYS`; build `url` from `CLUB_INVITE_URL`
- [x] 3.2 Implement `ClubInviteService.rotate(clubId, ownerId)` — verify ownership; in one transaction revoke the active invite and issue a new one
- [x] 3.3 Implement `ClubInviteService.revoke(clubId, ownerId)` — verify ownership; set `revokedAt` on the active invite (no-op if none)
- [x] 3.4 Implement `ClubInviteService.preview(token)` — resolve active invite by token; return `{ clubId, name, coverImageUrl, memberCount }`; throw `410 Gone` when unknown/revoked/expired
- [x] 3.5 Implement `ClubInviteService.redeem(token, userId)` — resolve active invite (`410` if invalid); insert `member` membership; on unique-violation (already a member) treat as idempotent success; return the club. Reserve `TODO(events)` seam for `MemberJoined`
- [x] 3.6 Implement `ClubInviteService.email(clubId, ownerId, emails)` — verify ownership, ensure active invite, send link to each address via `EmailClient` wrapped in try/catch with structured logging
- [x] 3.7 Implement `ClubService.leave(clubId, userId)` — `404` for non-members, `403` for the owner, otherwise delete membership. Reserve `TODO(events)` seam for `MemberLeft`
- [x] 3.8 Add `core/notifications/club-invite.template.ts` `buildClubInviteEmail({ to, clubName, inviteUrl })` mirroring the identity notification templates (club name only, no inviter identity)
- [x] 3.9 Add `MemberLeft` to the deferred event contract definitions and ensure they are exported via the clubs `index.ts` barrel (alongside `ClubCreated` / `MemberJoined` / `ClubDeleted`)

## 4. HTTP Layer — DTOs and Controllers

- [x] 4.1 DTOs: `EmailInviteDto` (`emails` array of `@IsEmail`, min 1, max 20). Response interfaces: `IClubInviteResponse` (`token`, `url`, `expiresAt`), `IClubInvitePreviewResponse` (`clubId`, `name`, `coverImageUrl`, `memberCount`)
- [x] 4.2 Implement `ClubInviteController` with per-method guards (no class-level guard): `GET /clubs/:id/invite` (200, owner), `POST /clubs/:id/invite/rotate` (200, owner), `DELETE /clubs/:id/invite` (204, owner), `POST /clubs/:id/invite/email` (202, owner), `GET /clubs/join/:token` (200, public), `POST /clubs/join/:token` (200, authenticated)
- [x] 4.3 Add `POST /clubs/:id/leave` (204) to the existing `ClubsController`
- [x] 4.4 Wire `ClubInviteController` and `ClubInviteService` into `clubs.module.ts`; ensure `MailModule` and `ConfigModule` access is available
- [x] 4.5 Confirm route shapes do not collide with existing `GET /clubs/:id` (verify `clubs/join/:token` resolves correctly and is not captured by the `:id` param) — RESOLVED: `clubs/join/:token` is a 3-segment path; `clubs/:id` matches 2 segments only, so no collision regardless of registration order. `:id/invite` requires a literal `invite` third segment, so it never captures `join/:token`.

## 5. Test Support

- [x] 5.1 Add `__test-support__/factories/club-invite.factory.ts` `createClubInvite(...)` using raw `pg` with parameterized SQL + `RETURNING`
- [x] 5.2 Add `club_invite` to `CLUBS_TABLES` and `ClubInviteEntity` to `CLUBS_TEST_ENTITIES`; export `createClubInvite` from `__test-support__/index.ts`
- [x] 5.3 Verify `truncateClubs()` and the schema-sync helper cover `club_invite`

## 6. Tests

- [x] 6.1 Unit specs for `ClubInviteService` (get/create, rotate, revoke, preview, redeem idempotency, email best-effort) — mock repositories, `EmailClient`, `ConfigService`
- [x] 6.2 Unit specs for `ClubService.leave` (member success, owner `403`, non-member `404`)
- [x] 6.3 Integration specs for `ClubInviteRepository` and membership join/leave (active-invite resolution, expiry/revocation filtering, unique-constraint idempotency) seeded via factories
- [x] 6.4 E2E specs: owner gets/rotates/revokes link; email send (mocked provider); public preview (valid + `410`); join (success, idempotent, `410`, `401`); leave (member `204`, owner `403`, non-member `404`)
- [x] 6.5 Run `pnpm nx test api` (unit + int) and `pnpm nx test:e2e api`; ensure coverage thresholds hold — 212 unit/int + 54 e2e all green

## 7. Verification

- [x] 7.1 `pnpm nx typecheck api` passes (exit 0, no errors). `pnpm nx run api:lint:arch` passes (dependency-cruiser: 0 violations, "Successfully ran target lint:arch"). `cd apps/api && pnpm exec eslint src` passes (exit 0, no errors or warnings). Unit+int: 45/45 suites, 364/364 tests green (second run; first run had a transient per-worker DB isolation race on `club.service.int-spec.ts` that cleared on retry). E2E: 7/7 suites, 97/97 tests green.
- [x] 7.2 Verified against throwaway DB `plot_twist_migtest` using `docker exec` for psql (no local psql binary). Workaround required: pre-created `identity` schema manually before running migrations due to pre-existing bug in `IdentityInit1776902370578` (`CREATE TYPE "identity"."user_status_enum"` runs before `CREATE SCHEMA IF NOT EXISTS "identity"`, so it fails with Postgres error `3F000` on a truly fresh DB). With workaround applied: `up()` executed `Migration CreateClubInviteTable1748822400000 has been executed successfully` — table `clubs.club_invite` created with columns (id, createdAt, updatedAt, clubId, token, createdByUserId, expiresAt, revokedAt), index `UQ_club_invite_token` (unique), index `IDX_club_invite_club` confirmed via `\d clubs.club_invite`. `down()` executed `Migration CreateClubInviteTable1748822400000 has been reverted successfully` — dropped both indexes and table; `\dt clubs.*` confirmed only `clubs.club` and `clubs.membership` remain. Note: the club invite migration is the 3rd of 4 migrations (not the last), so `migration:revert` must be run 3 times from a fully-migrated DB to reach it.
- [x] 7.3 `npx openspec validate add-club-invite-and-leave --strict` passes
