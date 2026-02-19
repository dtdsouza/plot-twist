# Plot-Twist Domain Definitions

Strategic DDD domain model for the Plot-Twist book club platform. This document defines bounded contexts, aggregates, domain events, and their relationships. It serves as the architectural blueprint for all implementation decisions.

---

## 1. Subdomain Classification

| Type | Subdomain | Justification |
|------|-----------|---------------|
| **Core** | Club Management | Central concept -- what differentiates Plot-Twist |
| **Core** | Reading Activity | Book assignments, active reading constraint, reading history |
| **Core** | Meetings | Scheduling tied to clubs and readings, recurring schedules |
| **Supporting** | Social Graph | Friendships -- supports discovery and invitations |
| **Supporting** | Book Catalog | Reference data for books |
| **Generic** | Identity & Access | Auth, profiles -- solved problem |
| **Generic** (future) | Notifications | Email/push -- use third-party services |

**Core** subdomains are where Plot-Twist's competitive advantage lies and where the most design effort should be invested. **Supporting** subdomains enable core workflows but are not differentiating. **Generic** subdomains are solved problems that should be implemented with minimal custom logic.

---

## 2. Bounded Contexts

### BC1: Identity (Generic)

- **Aggregate Root:** `User`
- **Scope:** Registration, authentication, JWT, password reset, profile management, user search
- **Key Fields:** email, passwordHash, displayName, avatar, bio
- **Responsibility:** Owns the canonical user identity. All other contexts reference users by `userId` only.

### BC2: Social (Supporting)

- **Aggregate Root:** `Friendship`
- **Scope:** Friend requests, accept/decline, friends list, removal
- **Invariants:**
  - No self-friend-requests
  - No duplicate friendship pairs (A-B is the same as B-A)
  - Only the addressee can accept a request

### BC3: Clubs (Core)

- **Aggregate Root:** `Club` (with child entities `Membership` and `Invitation`)
- **Scope:** Club CRUD, member roles, invitations, leave/remove
- **Invariants:**
  - Exactly one owner per club at all times
  - No duplicate memberships (one user, one membership per club)
  - Owner cannot leave without transferring ownership
- **Roles:** `owner`, `member`

### BC4: Reading (Core)

- **Aggregate Roots:** `Book` + `ClubReading` (separate aggregates)
- **Scope:** Book catalog, assign books to clubs, reading status lifecycle
- **Invariants:**
  - At most one active reading per club at any time
  - A reading must reference a valid book and club
- **Design Decision:** `Book` and `ClubReading` are separate aggregates because books exist independently and can be shared across clubs. `Book` is a reference entity; `ClubReading` is the behavioral aggregate.
- **Reading Status Lifecycle:** `planned` -> `active` -> `finished` (or `abandoned`)

### BC5: Meetings (Core)

- **Aggregate Root:** `Meeting`
- **Scope:** Schedule meetings, recurring patterns, video call links, notes
- **References:** `clubId` and `bookId` by value (not by aggregate relationship)
- **Design Decision:** Meetings reference clubs and readings by ID only. This keeps the Meeting aggregate self-contained and avoids cross-context coupling.

---

## 3. Context Map

```
  Identity ──(conformist)──> Social
     │
     │ conformist (userId refs)
     v
   Clubs <──(customer/supplier)──> Reading
     │                                │
     │ customer/supplier              │ customer/supplier
     v                                v
                  Meetings
```

### Integration Patterns

| Upstream | Downstream | Pattern | What Flows |
|----------|------------|---------|------------|
| Identity | Social, Clubs, Reading | Conformist | `userId` as-is |
| Clubs | Reading | Customer/Supplier | `ClubCreated`, `ClubDeleted` events |
| Clubs | Meetings | Customer/Supplier | Membership events |
| Reading | Meetings | Customer/Supplier | `ReadingStarted`, `ReadingFinished` events |

**Conformist** means the downstream context adopts the upstream model as-is (no translation layer). This is appropriate for Identity because `userId` is a stable, simple reference.

**Customer/Supplier** means the upstream context publishes events that the downstream context consumes. The upstream team considers downstream needs when evolving the API.

### Shared Kernel

`shared/util-types` contains branded ID types, pagination interfaces, and the API response interface. This is intentionally minimal -- only types that genuinely need to be identical across all contexts belong here.

---

## 4. Domain Events

### Identity Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `UserRegistered` | userId, email, displayName | Social, Clubs |
| `UserProfileUpdated` | userId, changedFields | Social |
| `UserDeleted` | userId | Social, Clubs, Reading, Meetings |

### Social Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `FriendRequestSent` | requesterId, addresseeId | Notifications (future) |
| `FriendRequestAccepted` | requesterId, addresseeId | Notifications (future) |

### Clubs Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `ClubCreated` | clubId, ownerId, name | Reading |
| `ClubDeleted` | clubId | Reading, Meetings |
| `MemberJoined` | clubId, userId, role | Meetings |
| `MemberRemoved` | clubId, userId | Meetings |
| `MemberInvited` | clubId, inviteeId, inviterId | Notifications (future) |

### Reading Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `BookAddedToCatalog` | bookId, title, author | -- |
| `ReadingStarted` | clubReadingId, clubId, bookId | Meetings |
| `ReadingFinished` | clubReadingId, clubId, bookId | Meetings |

### Meetings Context

| Event | Payload | Key Consumers |
|-------|---------|---------------|
| `MeetingScheduled` | meetingId, clubId, date | Notifications (future) |
| `MeetingCanceled` | meetingId, clubId | Notifications (future) |
| `MeetingUpdated` | meetingId, changedFields | Notifications (future) |

**MVP Infrastructure:** NestJS `EventEmitter2` (in-process, synchronous). This is sufficient for a single-process monolith. Migrate to a message broker (e.g., RabbitMQ, AWS SNS/SQS) when scale demands it or when contexts are extracted into separate services.

---

## 5. Nx Library Structure

### Naming Convention

```
libs/{scope}/{type}-{name}
```

Where `{type}` is one of: `feature`, `ui`, `data-access`, `util`.

### Backend Libraries

```
libs/
  shared/
    util-types/              # Branded IDs, IApiResponse, IPaginatedResponse, IBaseEntity
    util-events/             # Domain event definitions, IEventBus interface
    data-access-database/    # TypeORM config, database module, migrations

  identity/
    util-identity/           # DTOs, IUser, EUserStatus
    data-access-identity/    # User entity, user repository
    feature-identity/        # Auth + User controllers, services, JWT guard

  social/
    util-social/             # DTOs, IFriendship, EFriendshipStatus
    data-access-social/      # Friendship entity, repository
    feature-social/          # Friendship controller, service

  clubs/
    util-clubs/              # DTOs, IClub, IMembership, EClubRole, EInvitationStatus
    data-access-clubs/       # Club, Membership, Invitation entities, repositories
    feature-clubs/           # Club controller, membership service

  reading/
    util-reading/            # DTOs, IBook, IClubReading, EReadingStatus
    data-access-reading/     # Book, ClubReading entities, repositories
    feature-reading/         # Book + ClubReading controllers, services

  meetings/
    util-meetings/           # DTOs, IMeeting, ERecurringSchedule
    data-access-meetings/    # Meeting entity, repository
    feature-meetings/        # Meeting controller, service
```

### Dependency Rules (Nx Module Boundaries)

```
feature-*       --> data-access-*, util-*
data-access-*   --> util-*
util-*          --> shared/util-types only
Any scope       --> shared/*
```

Cross-scope dependencies flow only through **util** libraries (ID types, DTOs) -- never direct service imports between contexts.

### Frontend Libraries (Future)

```
libs/
  identity/  feature-auth/, ui-auth/, data-access-auth/
  clubs/     feature-club-list/, feature-club-detail/, ui-club-card/, data-access-clubs/
  reading/   feature-book-search/, ui-book-card/, data-access-reading/
  meetings/  feature-meeting-list/, ui-meeting-card/, data-access-meetings/
  shared/    ui-layout/, ui-components/, util-formatting/
```

---

## 6. Database Ownership

Single PostgreSQL instance with **separate schemas per bounded context**:

| Context | Schema | Tables |
|---------|--------|--------|
| Identity | `identity` | `identity.user` |
| Social | `social` | `social.friendship` |
| Clubs | `clubs` | `clubs.club`, `clubs.membership`, `clubs.invitation` |
| Reading | `reading` | `reading.book`, `reading.club_reading` |
| Meetings | `meetings` | `meetings.meeting` |

### Rules

- **No JOINs across schemas.** Cross-context data is assembled at the application layer.
- Each `data-access-*` module configures its own schema via the entity decorator: `@Entity({ schema: 'identity' })`.
- Each schema can be extracted to its own database later without changing domain logic.

---

## 7. Evolution Strategy

New features map cleanly to this structure without modifying existing contexts:

| Future Feature | Approach | Impact on Existing |
|----------------|----------|--------------------|
| Discussion threads | New `discussions/` bounded context | None |
| Reading progress | Extend `reading/` with `ReadingProgress` entity | Additive only |
| Book ratings/reviews | New `reviews/` bounded context | None |
| Recommendations | New `recommendations/` context (read model, CQRS) | None |
| Notifications | New `notifications/` context (downstream consumer) | None |
| External book APIs | ACL adapter in `reading/data-access-book-providers/` | None |
| Real-time chat | New `chat/` bounded context with WebSocket gateway | None |

---

## 8. Implementation Priority

1. `shared/util-types` + `shared/util-events` + `shared/data-access-database`
2. `identity/*` (prerequisite for everything)
3. `social/*`
4. `clubs/*`
5. `reading/*`
6. `meetings/*`
7. Wire all feature modules into `apps/api/app.module.ts`

Each phase should be a complete vertical slice: types, entities, repository, service, controller, and tests.
