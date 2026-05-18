## Context

The Plot-Twist API today contains a single domain module (`identity`) and a set of shared modules (`config`, `logging`, `auth`, `mail`, `storage`, `persistence`, `health`). DOMAINS-DEFINITION pins three bounded contexts for MVP — Identity (done), Clubs (this change), Discussions (next). The web app currently has only the auth-related surface; post-login users have nowhere to go.

DAN-9 stands up Clubs end-to-end as a vertical slice (DOMAINS-DEFINITION §9). Two architectural patterns from earlier work are reused rather than reinvented:

1. **Module shape** — `module/identity/` is the template: `core/`, `http/{controller,dto}/`, `persistence/{entity,enum,interface}/`, `migrations/`, `index.ts` barrel, `__test-support__/`. ADR-0006 mandates `@module/clubs` as the only public entry. Dependency-cruiser already enforces that domain modules cannot import each other.
2. **Browser uploads** — ADR-0009 fixes the protocol (presigned POST + finalize). The avatar implementation in `module/identity/core/avatar.service.ts` and the `@module/shared/storage` + `@module/shared/image` modules are the building blocks; cover image reuses them.

One piece of project plumbing is new:

- **Path alias.** `@module/clubs` doesn't exist yet; `tsconfig.base.json`, `tsconfig.spec.json`, and the dependency-cruiser config all need the addition (mirror `@module/identity`).

Domain event emission (`ClubCreated`, `MemberJoined`, `ClubDeleted`) is **deferred to a follow-up issue**. DOMAINS-DEFINITION §4 nominates `EventEmitter2` as the MVP bus, but no consumer exists yet (Discussions, Notifications). Standing up the bus here without consumers would add code that nothing exercises; we'll wire it in alongside the first consumer instead. The service-layer seam (a single place — `ClubService.create` / `delete` — where emission will hook in) is still designed cleanly so retrofitting is a small change.

## Goals / Non-Goals

**Goals**

- A self-contained `module/clubs/` that other modules consume only via `@module/clubs` (ADR-0006 compliance verified by dependency-cruiser).
- Atomic club + owner-membership creation. The aggregate cannot be observed in a state where a club has no owner.
- A cover-image flow whose security model is identical to avatars (S3-enforced size + content-type, server-side magic-byte sniff at finalize).
- A web surface that delivers the post-sign-up flow described in `mvp-spec.md §User Flows`: empty dashboard → Create Club → land in the club shell.

**Non-Goals**

- Domain event emission (`ClubCreated`, `MemberJoined`, `ClubDeleted`) and the `@nestjs/event-emitter` integration. Postponed to a dedicated follow-up issue alongside the first consumer.
- Invitations of any kind (targeted email, shareable link). Tracked in a future DAN issue. The `invitation` table is **not** created here — only `club` and `membership`.
- Role transitions, member removal, ownership transfer, leave-club semantics.
- Real chat/members/settings UIs at `(app)/clubs/[id]`. Only the shell renders.
- Extracting a shared two-phase-upload helper across avatars and club covers. The duplication is acceptable for one more occurrence; revisit when a third surface (e.g., book covers) appears.
- Updating `module/health` to report `clubs` schema readiness. Will follow when health checks are revisited.

## Decisions

### D1. `Membership` is a child entity of the `Club` aggregate, not a separate module

DOMAINS-DEFINITION §2 BC2 is explicit: "A single NestJS module (`module/clubs/`). `Membership` and `Invitation` are child entities of the `Club` aggregate, not separate modules. The aggregate boundary enforces the invariants above." We honor that without revisiting.

**Alternatives considered:** A standalone `module/memberships/`. Rejected because the unique-owner invariant lives across `club` and `membership` and is enforced inside the same transaction — splitting modules would either require a distributed handshake (overkill at this size) or a leaky cross-module repository.

### D2. Application-side UUIDs, not DB-generated

Per ADR-0005, `id` is generated in the application layer (via `BaseEntity` in `@module/shared/persistence`). This keeps `ClubCreated` emittable before the transaction commits — the `clubId` is known upfront.

### D3. `ownerId` lives on `club` AND a row in `membership` with `role = 'owner'`

The owner is denormalized: a column on `club` and a row in `membership`. Two reasons:

- `GET /clubs/:id` and the My-Clubs list need the role badge cheaply — joining `club → membership` for the caller is fine, but having `ownerId` on the row lets `PATCH/DELETE` enforce ownership with one read.
- Future "transfer ownership" needs to atomically swap the column and reassign the row; defining both fields now means the contract is already in place when that issue lands.

**Trade-off:** the two fields can drift if code bypasses the service. Mitigation: only `ClubService` writes to either, and an int-spec asserts that for every `club` row, exactly one `membership` row with `role = 'owner'` and matching `userId` exists.

### D4. Non-member sees 404 on `GET /clubs/:id`, not 403

A 403 leaks the existence of the club. Clubs are not assumed to be discoverable; until invitations exist there is no way to know an id you aren't a member of. 404 keeps the surface uniform. Tests assert the exact status code.

### D5. `coverImageUrl` is read-only on `PATCH /clubs/:id`

The two-phase upload is the only legitimate way to set the cover. Accepting it on `PATCH` would let a client point the column at an arbitrary URL or skip magic-byte validation. We reject the field at the DTO layer (whitelist) and return `400` if a client sends it.

### D6. Atomic create via TypeORM transaction with both repository writes

`ClubService.create` opens a transaction via `DataSource.transaction(...)`, inserts the club, inserts the owner membership, commits, and returns the club. The same transaction is the seam where future event emission will hook in (after commit, before return).

```ts
const club = await this.dataSource.transaction(async (m) => {
  const club = m.create(ClubEntity, { ... ownerId })
  await m.save(club)
  await m.save(m.create(MembershipEntity, { clubId: club.id, userId: ownerId, role: 'owner' }))
  return club
})
// Future: emit ClubCreated + MemberJoined here once the event bus is introduced.
return club
```

**Alternative considered:** outbox pattern (write event rows in the same tx, separate dispatcher). Overkill for the MVP and unnecessary while no consumer exists. Worth revisiting when a real broker arrives.

### D7. Cover image keys are nested under `clubs/{clubId}/cover/`

Bucket layout:

```
S3_BUCKET_CLUB_COVERS/
  clubs/{clubId}/cover/pending/{uploadId}        ← staging
  clubs/{clubId}/cover/{uploadId}.{ext}          ← committed
```

A new lifecycle rule on `clubs/*/cover/pending/*` (1-day expiry) lives in the LocalStack init script next to the avatar rule. Production policy mirrors it. Prefix matches the per-user pattern from avatars (`avatars/pending/{userId}/...`) — the `{clubId}` segment scopes both staging and committed keys to the club so the finalize endpoint can assert key prefix from `:id` alone (matching ADR-0009's "per-user prefix" defense-in-depth control).

### D8. Bucket is dedicated, not shared with avatars

`S3_BUCKET_CLUB_COVERS` is its own bucket so its public-read policy and lifecycle rule are independent of avatars'. The size/dimension/MIME caps for covers are likely to diverge from avatars (a cover is much larger than a 200×200 avatar), and a separate bucket avoids cross-contamination if either policy changes.

**Alternative considered:** A single `media` bucket with prefix-scoped policies. Cheaper in infra cost but couples unrelated rate-limiting / lifecycle / quota tuning. Rejected for now.

### D9. Web Create flow creates the club first, then uploads the cover

The presigned POST policy hard-codes the staging key, which includes the `clubId`. We need the club to exist before we can mint the URL. Sequence:

1. `POST /api/clubs` with `{ name, description }` → get `{ id }`.
2. If a file was selected: `POST /api/clubs/:id/cover/upload-intent` → S3 POST → `POST /api/clubs/:id/cover/finalize`.
3. Navigate to `/(app)/clubs/:id`.

If the cover upload fails after the club is created, the user still has the club (no cover). This is acceptable; the UI surfaces the error and offers retry.

**Alternative considered:** "Pre-mint a clubId on the client → upload to that key → create-club commits it." Cute but breaks the ADR-0009 "key prefix belongs to caller" invariant (the API has no way to know an uncommitted id is theirs). Rejected.

## Risks / Trade-offs

- **[Risk] Drift between `club.ownerId` and the `membership.role='owner'` row.** Mitigation: only `ClubService` writes either; an integration spec asserts the invariant across every persisted club; the partial unique index makes a stray duplicate owner row impossible.
- **[Risk] Cover upload may leave orphan staging objects** if the user closes the tab between upload and finalize. Mitigation: the 1-day S3 lifecycle rule on `cover/pending/*` reclaims them with no code (same model as avatars).
- **[Trade-off] No upload progress UI in this iteration.** The cover field is small enough (single image) that a spinner is adequate. Real progress events can come with the shared upload helper later.
- **[Trade-off] `GET /clubs` does a join across `club` and `membership`.** Both tables are in `clubs` schema (legal per STATE-ISOLATION Rule 2). The `(clubId, userId)` unique index and the new `userId` index make the query cheap at MVP cardinality. No pagination — revisit when a user has dozens of clubs.

## Migration Plan

The change is additive: new schema, new tables, new endpoints, new routes. No existing data is touched.

1. Deploy: TypeORM migration `XXXXXXXXXXXXX-create-clubs-schema-and-tables.ts` runs as part of the API release.
2. Verify: schema `clubs` exists, both tables exist, unique index present, indexes present.
3. Rollback: the migration's `down()` drops `clubs.membership`, then `clubs.club`, then the schema (in that order). Safe because no data depends on these tables in any other context yet.

No data backfill required.

## Open Questions

- **When to introduce the event bus.** The `ClubService.create` / `delete` seam is reserved for emission. The follow-up issue should bundle: adding `@nestjs/event-emitter`, registering `EventEmitterModule.forRoot()` in `AppModule`, defining payload types under `module/clubs/core/event/` and exporting them via `@module/clubs`, and emitting `ClubCreated` / `MemberJoined` / `ClubDeleted`. Best done as part of the first consumer issue (Discussions or Notifications) so the wiring isn't dark code.
- **Member count in `GET /clubs` payload.** The web cards show "N members" implicitly via the cover stats. Including a `memberCount` field on each list item is cheap but adds a `COUNT(*) GROUP BY clubId` to the query. Default: include it, keep it computed in the SQL — not stored. Confirm during implementation.
- **Default cover placeholder.** Bundled in the web app vs. a public S3 object. Default: bundled SVG/PNG — no S3 round-trip for the empty state. Open to changing if the design language wants something less generic.
- **Health-check integration for the `clubs` schema.** ADR-0012's per-context indicator pattern probably wants a `ClubsHealthIndicator`. Out of scope for DAN-9 unless it's a one-liner during implementation; otherwise track separately.
