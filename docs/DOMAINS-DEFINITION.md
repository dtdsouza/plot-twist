# Plot-Twist Domain Definitions

Strategic DDD domain model for the Plot-Twist book club platform. This document defines bounded contexts, aggregates, domain events, and their relationships. It serves as the architectural blueprint for all implementation decisions.

**Scope note:** This MVP intentionally focuses on *clubs and the conversations inside them*. Reading-status tracking, social graph, and meeting scheduling are deliberately out of scope — see §8 *Out of Scope* for rationale.

---

## 1. Subdomain Classification

| Type | Subdomain | Justification |
|------|-----------|---------------|
| **Core** | Club Management | Central concept -- what differentiates Plot-Twist |
| **Core** | Discussions | Real-time, threaded conversation is how the club lives between events |
| **Generic** | Identity & Access | Auth, profiles -- solved problem |
| **Generic** (future) | Notifications | Email/push -- use third-party services |

**Core** subdomains are where Plot-Twist's competitive advantage lies and where the most design effort should be invested. **Generic** subdomains are solved problems that should be implemented with minimal custom logic.

---

## 2. Bounded Contexts

### BC1: Identity (Generic)

- **Aggregate Root:** `User`
- **Scope:** Registration, authentication, JWT, password reset, profile management, user search
- **Key Fields:** email, passwordHash, displayName, avatar, bio
- **Responsibility:** Owns the canonical user identity. All other contexts reference users by `userId` only.

### BC2: Clubs (Core)

- **Aggregate Root:** `Club` (with child entities `Membership`, `Invitation`, and a single `inviteLinkToken`)
- **Scope:** Club CRUD, member roles, invitations (targeted-by-email and shareable-link), leave/remove
- **Invitation surfaces:**
  - **Targeted `Invitation`** — bound to a specific email; lifecycle `pending → accepted | declined | revoked`. Only the addressed email can accept.
  - **Shareable `inviteLinkToken`** — a single regenerable token on the Club. Owner can generate, rotate (replaces the previous token), or revoke (clears it). Anyone signed in who opens an active link joins as a member.
- **Invariants:**
  - Exactly one owner per club at all times
  - No duplicate memberships (one user, one membership per club)
  - Owner cannot leave without transferring ownership
  - At most one active invite link token per club; rotating invalidates the previous token immediately
- **Roles:** `owner`, `member`
- **Module shape:** A single NestJS module (`module/clubs/`). `Membership` and `Invitation` are child entities of the `Club` aggregate, not separate modules. The aggregate boundary enforces the invariants above.

### BC3: Discussions (Core)

- **Aggregate Root:** `Message`
- **Scope:** Real-time chat per club, with threaded replies on top-level messages (Slack-style). One implicit "channel" per club; `clubId` discriminates.
- **Key Fields:** `id`, `clubId`, `authorId`, `parentMessageId` (nullable), `content`, `postedAt`, `editedAt`, `deletedAt`
- **Threading rule:** Two levels maximum. A `Message` is either top-level (`parentMessageId === null`) or a thread reply pointing at a top-level message. Replies-to-replies are not allowed — they collapse into the same thread.
- **Invariants:**
  - Author must be a member of the club at post time
  - A thread reply must reference a top-level message in the same club
  - Edits and deletes are author-only (or club owner for moderation)
- **Real-time delivery:** WebSocket gateway (NestJS `@WebSocketGateway`). Persistence is the source of truth; the gateway broadcasts after the message is persisted.

---

## 3. Context Map

```
  Identity ──(conformist, userId refs)──> Clubs
                                            │
                                            │ customer/supplier
                                            v
                                       Discussions
```

### Integration Patterns

| Upstream | Downstream | Pattern | What Flows |
|----------|------------|---------|------------|
| Identity | Clubs, Discussions | Conformist | `userId` as-is |
| Clubs | Discussions | Customer/Supplier | `MemberJoined`, `MemberRemoved`, `ClubDeleted` events |

**Conformist** means the downstream context adopts the upstream model as-is (no translation layer). This is appropriate for Identity because `userId` is a stable, simple reference.

**Customer/Supplier** means the upstream context publishes events that the downstream context consumes. Discussions cares who is currently a member (to enforce post-time membership) and when a club is deleted (to soft-delete or archive its messages).

### Shared Kernel

`module/shared/util-types` (or equivalent) holds branded ID types and common response shapes. Kept intentionally minimal — only types that genuinely need to be identical across contexts.

---

## 4. Domain Events

### Identity Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `UserRegistered` | userId, email, displayName | Clubs |
| `UserProfileUpdated` | userId, changedFields | Clubs, Discussions (denormalized author display) |
| `UserDeleted` | userId | Clubs, Discussions |

### Clubs Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `ClubCreated` | clubId, ownerId, name | Discussions (provisions implicit channel) |
| `ClubDeleted` | clubId | Discussions |
| `MemberJoined` | clubId, userId, role | Discussions |
| `MemberRemoved` | clubId, userId | Discussions |
| `MemberInvited` | clubId, inviteeEmail, inviterId | Notifications (future, sends invitation email) |
| `InviteLinkRotated` | clubId, rotatedBy | -- |
| `InviteLinkRevoked` | clubId, revokedBy | -- |

### Discussions Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `MessagePosted` | messageId, clubId, authorId, parentMessageId | Notifications (future, e.g., @mentions) |
| `MessageEdited` | messageId, editedAt | -- |
| `MessageDeleted` | messageId, deletedAt | -- |

**MVP Infrastructure:** NestJS `EventEmitter2` (in-process, synchronous). Sufficient for a single-process monolith. Migrate to a message broker (RabbitMQ, AWS SNS/SQS) when scale demands it or when contexts are extracted into separate services.

---

## 5. Module Structure (apps/api)

All NestJS modules live under `apps/api/src/module/`. See `CLAUDE.md` and ADR-0006 for the full convention.

```
apps/api/src/module/
├── app/                         # Orchestrator (root AppModule)
├── identity/                    # BC1
├── clubs/                       # BC2
├── discussions/                 # BC3
└── shared/
    ├── config/                  # Zod-validated env
    ├── mail/                    # Resend
    ├── typeorm/                 # BaseEntity, BaseRepository, TypeormPersistenceModule
    └── persistence/             # DataSourceOptions builder + PersistenceModule
```

### Cross-Module Imports

Cross-module imports use `@module/*` path aliases and resolve to a public-API barrel (`index.ts`). Within-module imports stay relative. Allowed dependency directions are enforced by dependency-cruiser:

- Domain modules → themselves, or `module/shared/*`
- `module/shared/*` → `module/shared/*` only
- `module/app/` → any module (orchestrator exception)

### Future Frontend Libraries

```
libs/
  identity/    feature-auth/, ui-auth/, data-access-auth/
  clubs/       feature-club-list/, feature-club-detail/, ui-club-card/, data-access-clubs/
  discussions/ feature-chat/, ui-message/, data-access-discussions/
  shared/      ui-layout/, ui-components/, util-formatting/
```

---

## 6. Database Ownership

Single PostgreSQL instance with **separate schemas per bounded context**:

| Context | Schema | Tables |
|---------|--------|--------|
| Identity | `identity` | `identity.user` |
| Clubs | `clubs` | `clubs.club` (includes `inviteLinkToken`), `clubs.membership`, `clubs.invitation` |
| Discussions | `discussions` | `discussions.message` |

### Rules

- **No JOINs across schemas.** Cross-context data is assembled at the application layer.
- Each module configures its own schema via the entity decorator: `@Entity({ schema: 'identity', name: 'user' })`.
- Each schema can be extracted to its own database later without changing domain logic.

See `docs/STATE-ISOLATION.md` for the full rules.

---

## 7. Evolution Strategy

New features map cleanly to this structure without modifying existing contexts:

| Future Feature | Approach | Impact on Existing |
|----------------|----------|--------------------|
| Reading status / progress | New `reading/` BC if needed; otherwise rely on external apps (Goodreads, StoryGraph) | None |
| Meetings / scheduling | New `meetings/` BC; otherwise paste a Zoom/Meet link in chat | None |
| Social graph (friends, discovery) | New `social/` BC | None |
| Book ratings/reviews | New `reviews/` BC | None |
| Recommendations | New `recommendations/` context (read model, CQRS) | None |
| Notifications | New `notifications/` context (downstream consumer) | None |
| External book APIs | ACL adapter under `module/shared/` or new module | None |
| Message reactions, attachments | Extend `discussions/` additively | Additive only |

---

## 8. Out of Scope (and why)

These were considered and intentionally excluded from the MVP. Documented here so future contributors understand the deliberate omissions.

| Excluded | Rationale |
|----------|-----------|
| **Social graph (friendships)** | Club membership is the only social relationship that matters for MVP. Friend requests don't enable anything users can't already do via club invitations. |
| **Reading status / progress** | Goodreads, StoryGraph, and the like already solve this well. Plot-Twist is about the *club*, not the user's personal reading log. Revisit if a club-specific need emerges (e.g., "where is everyone in the current book"). |
| **Meetings** | A Zoom or Meet link pasted into the club chat is sufficient. No scheduling, recurrence, or reminders to model. Revisit when there's a real workflow around it. |
| **Separate Membership module** | `Membership` is a child entity of the `Club` aggregate; the aggregate enforces invariants. A separate NestJS module would split the boundary without solving a real problem. |

---

## 9. Implementation Priority

1. `module/shared/*` (already in place: `config`, `mail`, `typeorm`, `persistence`)
2. `module/identity/*` (already implemented)
3. `module/clubs/*` — Club CRUD, membership, invitations
4. `module/discussions/*` — Message persistence + WebSocket gateway

Each phase should be a complete vertical slice: entities, repository, service, controller (or gateway), and tests.
