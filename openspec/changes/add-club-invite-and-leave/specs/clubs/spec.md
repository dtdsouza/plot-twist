## ADDED Requirements

### Requirement: Club Invite Link

The system SHALL provide, per club, a single active shareable invite link that the club owner can retrieve, rotate, and revoke. The link SHALL be backed by a high-entropy token persisted in the `clubs` schema (table `club_invite`) so it can be re-displayed and shared. At most one active invite (not revoked, not expired) SHALL exist per club at any time.

#### Scenario: Owner retrieves the invite link

- **WHEN** an authenticated owner requests `GET /api/clubs/:id/invite`
- **THEN** the system SHALL return the club's active invite as `{ token, url, expiresAt }`, creating one if none is active, where `url` is built from the configured invite base URL and the token

#### Scenario: Owner rotates the invite link

- **WHEN** an authenticated owner requests `POST /api/clubs/:id/invite/rotate`
- **THEN** the system SHALL revoke the current active invite and issue a new token, and the previously issued link SHALL no longer be valid for joining

#### Scenario: Owner revokes the invite link

- **WHEN** an authenticated owner requests `DELETE /api/clubs/:id/invite`
- **THEN** the system SHALL mark the active invite revoked and respond `204`, and the link SHALL no longer be valid for joining

#### Scenario: Issued invite carries an expiry

- **WHEN** the system issues a new invite
- **THEN** it SHALL set `expiresAt` based on the configured invite expiry, and an expired invite SHALL NOT be valid for preview or joining

#### Scenario: Non-owner is forbidden from managing the link

- **WHEN** a member who is not the owner attempts to retrieve, rotate, or revoke the invite link
- **THEN** the system SHALL respond `403 Forbidden` and make no change

#### Scenario: Non-member cannot see the link exists

- **WHEN** a user who is not a member attempts to manage the invite link of a club
- **THEN** the system SHALL respond `404 Not Found`

### Requirement: Invite Link Email Delivery

The system SHALL allow a club owner to email the club's invite link to one or more recipient addresses. Delivery SHALL be best-effort: a send failure SHALL be logged with structured fields and SHALL NOT fail the request. The email SHALL identify the club by name and SHALL NOT require any cross-domain user lookup.

#### Scenario: Owner emails the invite link

- **WHEN** an authenticated owner submits `POST /api/clubs/:id/invite/email` with a non-empty list of valid email addresses
- **THEN** the system SHALL ensure an active invite exists and send the invite link to each address, responding `202 Accepted`

#### Scenario: Email send failure does not fail the request

- **WHEN** the email provider raises an error during delivery
- **THEN** the system SHALL log the failure with structured fields and still respond `202 Accepted`

#### Scenario: Invalid recipient list is rejected

- **WHEN** the request body contains no addresses, more than the allowed maximum, or a malformed email
- **THEN** the system SHALL respond `400 Bad Request` and send nothing

#### Scenario: Non-owner is forbidden from emailing the link

- **WHEN** a non-owner attempts to email the invite link
- **THEN** the system SHALL respond `403 Forbidden` (or `404` if the caller is not a member) and send nothing

### Requirement: Club Invite Preview

The system SHALL expose an unauthenticated, token-gated preview so an invitee can see which club a link belongs to before signing in. The preview SHALL return only a minimal public summary of the club.

#### Scenario: Valid token returns a club summary

- **WHEN** anyone requests `GET /api/clubs/join/:token` with a token of an active invite
- **THEN** the system SHALL respond `200` with `{ clubId, name, coverImageUrl, memberCount }` and SHALL NOT require authentication

#### Scenario: Invalid, revoked, or expired token

- **WHEN** the token does not match an active invite (unknown, revoked, or expired)
- **THEN** the system SHALL respond `410 Gone`

### Requirement: Join Club via Invite

The system SHALL allow any authenticated platform user to join a club as a `member` by redeeming a valid invite token. Joining SHALL be idempotent: redeeming a link for a club the caller already belongs to SHALL succeed without creating a duplicate membership.

#### Scenario: Authenticated user joins via a valid link

- **WHEN** an authenticated user submits `POST /api/clubs/join/:token` with a token of an active invite and is not yet a member
- **THEN** the system SHALL create a `membership` row with role `member` and `joinedAt` set to now, and respond `200` with the joined club

#### Scenario: Redeeming a link you already belong to is idempotent

- **WHEN** an authenticated user (including the owner who generated the link) redeems a token for a club they already belong to
- **THEN** the system SHALL NOT create a duplicate membership and SHALL respond `200` with the club

#### Scenario: Expired or revoked token cannot be redeemed

- **WHEN** an authenticated user redeems a token that is unknown, revoked, or expired
- **THEN** the system SHALL respond `410 Gone` and create no membership

#### Scenario: Unauthenticated join attempt is rejected

- **WHEN** an unauthenticated request is made to `POST /api/clubs/join/:token`
- **THEN** the system SHALL respond `401 Unauthorized`

### Requirement: Leave Club

The system SHALL allow a member to leave a club by removing their own membership. The club owner SHALL be blocked from leaving and MUST instead delete the club (or transfer ownership once that exists).

#### Scenario: Member leaves the club

- **WHEN** an authenticated member who is not the owner submits `POST /api/clubs/:id/leave`
- **THEN** the system SHALL delete the caller's membership row and respond `204 No Content`, and the club SHALL no longer appear in that user's club listing

#### Scenario: Owner is blocked from leaving

- **WHEN** the club owner submits `POST /api/clubs/:id/leave`
- **THEN** the system SHALL respond `403 Forbidden` and make no change

#### Scenario: Non-member leave attempt

- **WHEN** a user who is not a member submits `POST /api/clubs/:id/leave`
- **THEN** the system SHALL respond `404 Not Found`

### Requirement: Club Membership Change Events

The system SHALL define deferred domain-event contracts for membership changes driven by invites and leaving, reserving emission seams consistent with the module's existing deferred-events decision.

#### Scenario: MemberLeft contract defined

- **WHEN** the clubs module defines its domain-event contracts
- **THEN** a `MemberLeft` event type SHALL exist alongside the existing `MemberJoined` contract (emission MAY be deferred)

#### Scenario: Membership change emission seams

- **WHEN** a user joins a club via an invite or a member leaves a club
- **THEN** the service SHALL reserve clearly-marked seams (e.g., `TODO(events)` comments) where `MemberJoined` (on join) and `MemberLeft` (on leave) will later be emitted
