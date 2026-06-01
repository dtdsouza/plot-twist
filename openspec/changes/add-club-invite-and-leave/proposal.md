## Why

Today a club is a closed room: the only member is its creator, and there is no way to bring anyone else in or to step out. Growth and churn are both blocked. Owners need a frictionless way to invite people — by sharing a link or emailing it directly — and members need a self-service way to leave. The handoff designs (`club_detail`) already show an "Invite Member" affordance and a Members tab, so the UI direction is set; the backend capability is the gap.

## What Changes

- Add a **rotating invite link** per club: an owner can fetch the club's shareable join link, regenerate it (rotating the token), and revoke it.
- Add **email delivery** of the invite link: an owner can send the current join link to one or more email addresses (best-effort, via the existing Resend `EmailClient`).
- Add **join via invite link**: any authenticated platform user who opens a valid link can join the club as a `member`. Joining is idempotent (re-using a link you already redeemed is a no-op success).
- Add a **public invite preview** endpoint so the join landing page can show which club a token belongs to (name, cover, member count) before the invitee signs in.
- Add **leave club**: a member can remove their own membership. The owner is blocked from leaving (must delete or, later, transfer the club).
- Persist invites in a new `clubs.club_invite` table (one active invite per club); add a TypeORM migration.
- Add config for the invite link base URL and invite expiry; extend `.env.example`.
- Reserve `MemberJoined` / `MemberLeft` event seams (`TODO(events)`) consistent with the existing deferred-events decision.

## Capabilities

### New Capabilities

- `clubs`: no baseline spec exists yet on disk for the implemented clubs module (`openspec/specs/` is empty), so this delta is authored as `ADDED` requirements under the `clubs` capability — covering the invite-link lifecycle (get/rotate/revoke), invite email delivery, public invite preview, join-via-invite, leave-club, and the deferred `MemberLeft` event contract plus join/leave emission seams.

### Modified Capabilities

- _None._ (There is no existing `clubs` spec file under `openspec/specs/` to modify; the requirements above are added.)

## Impact

- Affected specs: `clubs` (new requirements for invite link lifecycle, email delivery, join-via-link, invite preview, and leave).
- Affected code (api):
  - `apps/api/src/module/clubs/` — new `club-invite.entity.ts`, `club-invite.repository.ts`, `club-invite.service.ts`, membership leave/join logic in `club.service.ts`, new controller(s) + DTOs + response interfaces, `club-invite.template.ts`, new migration, `__test-support__` factory + table/entity constant updates, `index.ts` barrel surface.
  - `apps/api/src/shared/module/config/` — invite URL + expiry config.
  - `apps/api/.env.example`, root `CLAUDE.md` (Clubs Module section).
- Migration needs: additive (new table + enum/columns only); no changes to existing `club`/`membership` tables.
- Risks: invite tokens are capability URLs stored to be re-shared; mitigated by owner-only management, rotation, revocation, and expiry. Authorization must be enforced on every invite-management and leave path.
- Dependencies: existing `@module/shared/mail`, `@module/shared/auth`, `@module/shared/persistence`, `@module/shared/config`. No new third-party packages.
