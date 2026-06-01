// Deferred domain-event contracts for the clubs module.
// Emission is intentionally deferred — these are type definitions only.
// No EventEmitter wiring. Seams are reserved via TODO(events) comments in services.
// Will be wired alongside the first consumer (e.g. Discussions).

export const CLUB_EVENTS = {
  CLUB_CREATED: 'clubs.club_created',
  MEMBER_JOINED: 'clubs.member_joined',
  MEMBER_LEFT: 'clubs.member_left',
  CLUB_DELETED: 'clubs.club_deleted',
} as const

export interface IClubCreatedEvent {
  readonly clubId: string
  readonly ownerId: string
  readonly occurredAt: Date
}

export interface IMemberJoinedEvent {
  readonly clubId: string
  readonly userId: string
  readonly occurredAt: Date
}

export interface IMemberLeftEvent {
  readonly clubId: string
  readonly userId: string
  readonly occurredAt: Date
}

export interface IClubDeletedEvent {
  readonly clubId: string
  readonly occurredAt: Date
}
