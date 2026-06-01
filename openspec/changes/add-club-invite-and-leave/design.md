## Context

The `clubs` module (schema `clubs`) already owns `club` and `membership` tables, an owner/member role enum, owner-only club writes, and a presigned cover-image flow. Membership today is created only at club-creation time (the creator becomes `owner`); there is no second path into a club and no way out.

This change adds three flows on top of the existing module:

1. **Invite-link lifecycle** — an owner-managed, rotating, revocable shareable link.
2. **Join via invite** — an authenticated platform user redeems a link to become a `member`.
3. **Leave** — a member removes their own membership; the owner is blocked.

Constraints carried from the existing architecture:

- **Schema isolation (Principle 8)**: invite rows live in the `clubs` schema; `userId` stays a plain `uuid` with no cross-schema FK to `identity.user`.
- **No cross-domain service injection (Principle 6)**: the email path must not call into Identity for user lookups.
- **Auth**: endpoints use `JwtAuthGuard` + `@CurrentUser()` from `@module/shared/auth`, except the public invite-preview endpoint.
- **Email**: best-effort via `EmailClient` from `@module/shared/mail`, mirroring `EmailChangeService`.
- **Events**: emission stays deferred (existing `TODO(events)` decision); contracts only.

## Goals / Non-Goals

**Goals:**

- One rotating invite link per club, owner-managed: get, rotate, revoke.
- Email the current invite link to one or more addresses (best-effort).
- Public, token-gated invite preview for the join landing page.
- Idempotent join-as-member via a valid link.
- Member self-service leave; owner explicitly blocked.
- Additive persistence and migration; no change to existing tables.
- Tests at unit / int / e2e levels per the project's testing rules.

**Non-Goals:**

- Per-invite (one-per-recipient) tokens, usage caps, or invite analytics — a single rotating link covers the request.
- Ownership transfer (the unblock path for an owner who wants to leave) — tracked separately.
- Role management beyond `owner` / `member` (no admins/moderators).
- Actual event emission — only the `MemberLeft` contract and seams are added.
- Frontend implementation — handoff UI informs the contract; web work is separate.
- Rate limiting / captcha on invite endpoints — noted as a follow-up risk, not built here.

## Decisions

### D1 — One rotating link, stored in a dedicated `clubs.club_invite` table

A new entity `ClubInviteEntity` (`@Entity({ schema: 'clubs', name: 'club_invite' })`) with: `clubId` (uuid), `token` (varchar, unique), `createdByUserId` (uuid), `expiresAt` (timestamptz, nullable), `revokedAt` (timestamptz, nullable). Invariant: **at most one active (`revokedAt IS NULL` and not expired) invite per club**, enforced at the application layer inside a transaction (rotate = revoke current + insert new), mirroring `EmailChangeTokenRepository.deleteAllForUser`.

- _Alternative — columns on `club`_: rejected; bloats the club aggregate and loses the natural audit trail (who/when/rotations). The codebase already favors separate token tables (`password_reset_token`, `email_change_token`).
- _Alternative — per-invite tokens table with `email`/`maxUses`_: rejected as out of scope (the user chose a single rotating link). The dedicated table leaves room to grow into this later without a rewrite.

### D2 — Store the raw token (capability URL), not a hash

Unlike password-reset / email-change tokens (stored as `sha256` because the raw value is single-use and never re-displayed), the invite link must be **retrievable and re-shareable** by the owner (`GET /clubs/:id/invite` and email delivery). So the random token is persisted in plaintext and looked up directly.

- Token = `crypto.randomBytes(32).toString('base64url')` (~256 bits).
- Risk is bounded by scope (grants only "join this club as `member`"), owner-only visibility, rotation, revocation, and expiry. Documented under Risks.
- _Alternative — hash-only_: rejected; it would force a rotate to re-obtain a shareable URL, breaking the "copy/share the link" UX the feature exists for.

### D3 — Owner-only invite management

Get / rotate / revoke / email all require `membershipRepository.existsOwnership(clubId, userId)`; non-owners get `ForbiddenException`, non-members get `NotFoundException` (consistent with existing club access semantics — don't reveal club existence to non-members). Matches the user's "owner only" decision and the existing owner-only write model.

### D4 — Join is idempotent; redemption validates the invite

`POST /clubs/join/:token` (auth required): resolve the active invite by token → if missing/revoked/expired return `410 Gone` ("Link expired or invalid", reusing the email-change precedent). Otherwise insert a `membership` with role `member`, `joinedAt = now`. If the caller is already a member (including the owner who generated the link), return success without creating a duplicate — relying on the existing `UQ_membership_club_user` constraint as the backstop (catch unique-violation → treat as already-joined). Returns the joined club so the web app can route straight in.

- _Alternative — 409 on re-join_: rejected; clicking a link twice is normal and shouldn't surface an error.

### D5 — Public invite preview endpoint

`GET /clubs/join/:token` is **unauthenticated** so an invitee who isn't signed in can see which club they're joining. Returns a minimal summary only: `{ clubId, name, coverImageUrl, memberCount }`. Implemented with **per-method guards** (no class-level `JwtAuthGuard` on the invite controller; `@UseGuards(JwtAuthGuard)` on the authenticated methods) so the preview can opt out. Invalid/expired/revoked token → `410 Gone`. The token is the capability; revealing the club name to a token holder is acceptable.

### D6 — Leave: member-only, owner blocked

`POST /clubs/:id/leave` (auth required): if caller is `owner` → `403 Forbidden` ("Owner cannot leave the club; delete it or transfer ownership"). If caller is not a member → `404` (same non-member semantics as D3). Otherwise delete the caller's membership row → `204 No Content`. Matches the user's "block owner from leaving" decision; ownership transfer is the future unblock.

### D7 — Email delivery is best-effort and Identity-free

`POST /clubs/:id/invite/email` with `{ emails: string[] }` ensures an active invite exists, then sends the link to each address via `EmailClient`, wrapped in `try/catch` with structured logging (mirrors `EmailChangeService.initiate`). A new template `buildClubInviteEmail({ to, clubName, inviteUrl })` lives at `clubs/core/notifications/club-invite.template.ts`. The email intentionally carries **only the club name** (already in-context) — no inviter name — to avoid injecting an Identity service across the domain boundary (Principle 6). Returns `202 Accepted`.

### D8 — A dedicated `clubs` config segment

Add a `clubsConfig` segment (`CLUB_INVITE_URL`, `CLUB_INVITE_EXPIRY_DAYS`) under `shared/module/config/segment`, exported as `CLUBS_CONFIG_KEY` / `IClubsConfig`. The join URL is built as `${CLUB_INVITE_URL}/${token}` (default `http://localhost:4200/clubs/join`), and issued invites expire after `CLUB_INVITE_EXPIRY_DAYS` (default 14; `expiresAt` nullable in the table to allow a future non-expiring option).

- _Alternative — reuse `mailConfig`_: rejected for the expiry value (not mail-related); module-specific config aligns with Principle 4 (Individual Scale) and keeps clubs configuration cohesive.

### D9 — Controllers and services layout

- New `ClubInviteController` holds invite lifecycle (`/clubs/:id/invite`, `/invite/rotate`, `DELETE /invite`, `/invite/email`), preview (`GET /clubs/join/:token`), and join (`POST /clubs/join/:token`). Per-method guards (D5). Route shapes are unambiguous against existing `GET /clubs/:id` (different segment depth / method).
- New `ClubInviteService` owns the token lifecycle, preview resolution, redemption (join), and email.
- `leave` is added to the existing `ClubService` and exposed via a new `POST /:id/leave` on the existing `ClubsController` (membership op on a club it already governs) — avoids a near-empty extra controller.
- Repositories: new `ClubInviteRepository extends BaseRepository`; reuse `MembershipRepository` (add `removeMembership(clubId, userId)` and a join-insert helper as needed) and `ClubRepository`.

### D10 — Test data via factories

Add `clubs/__test-support__/factories/club-invite.factory.ts` (`createClubInvite`) using raw `pg`, extend `CLUBS_TABLES` with `club_invite`, and add `ClubInviteEntity` to `CLUBS_TEST_ENTITIES` so `truncateClubs()` / schema sync cover it. Specs seed via factories, never via the new services.

## Risks / Trade-offs

- **Plaintext, re-shareable token (D2)** → bounded scope (`member` only), owner-only read, rotation, revocation, and `CLUB_INVITE_EXPIRY_DAYS` expiry; revoke/rotate immediately invalidates a leaked link.
- **Open invite link = anyone with the URL can join** → acceptable for this feature; mitigations are rotate/revoke/expiry. Per-recipient or approval-gated invites are a documented future option, not built now.
- **No rate limiting on join/preview/email** → enumeration of valid tokens is impractical (256-bit), but email-blasting via the email endpoint is possible → mitigate by owner-only access and a `emails[]` array cap (≤ 20) validated in the DTO. Endpoint-level rate limiting is a follow-up.
- **Email best-effort** → a send failure does not fail the request (link is already retrievable/copyable); failures are logged with structured fields. Trade-off: no delivery guarantee surfaced to the caller.
- **Owner cannot leave (D6)** → intentional until ownership transfer exists; error message points the owner to delete/transfer so the UX dead-end is explained.
- **Idempotent join via unique-constraint catch (D4)** → relies on `UQ_membership_club_user`; the service must distinguish unique-violation (already a member → success) from other DB errors.

## Migration Plan

1. Add `clubsConfig` env vars to the Zod schema with safe defaults; boot fails on invalid values.
2. Ship migration `migrations/<ts>-create-club-invite-table.ts`: `CREATE TABLE clubs.club_invite (...)` with a unique index on `token` and an index on `clubId`; `down()` drops the table. No changes to `club` / `membership`.
3. Deploy is additive and backward-compatible; existing clubs simply have no invite row until an owner first requests one.
4. **Rollback**: run the migration `down()` (drops `club_invite`); no data dependencies from other tables. Revert config additions.

## Open Questions

- Should `CLUB_INVITE_EXPIRY_DAYS = 0` (or null) mean "never expires"? Proposed default is 14 days with a nullable column to keep the option open.
- Cap on `emails[]` per send request — proposed ≤ 20; confirm during implementation.
- Should joining a club the user already owns/belongs to redirect vs. return the club body? Proposed: return the club (idempotent), let the web app route.
