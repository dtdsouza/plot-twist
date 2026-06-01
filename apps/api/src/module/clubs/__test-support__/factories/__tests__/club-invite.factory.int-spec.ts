import { closeTestPool } from '@module/shared/test-support'
import {
  createClub,
  createClubInvite,
  synchronizeClubsSchema,
  truncateClubs,
  type ClubsSchemaBootstrap,
} from '@module/clubs/test-support'

// A fixed UUID for the creator — no cross-schema FK on club_invite
const CREATOR_ID = 'aaaabbbb-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('createClubInvite factory (integration)', () => {
  let bootstrap: ClubsSchemaBootstrap

  beforeAll(async () => {
    bootstrap = await synchronizeClubsSchema()
  })

  beforeEach(async () => {
    await truncateClubs()
  })

  afterAll(async () => {
    await bootstrap.close()
    await closeTestPool()
  })

  it('inserts a row with generated token and returns the full row', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Factory Club' })

    // Act
    const invite = await createClubInvite({ clubId: club.id, createdByUserId: CREATOR_ID })

    // Assert
    expect(invite.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(invite.clubId).toBe(club.id)
    expect(invite.createdByUserId).toBe(CREATOR_ID)
    expect(invite.token).toBeTruthy()
    expect(invite.revokedAt).toBeNull()
    expect(invite.expiresAt).toBeInstanceOf(Date)
    expect(invite.createdAt).toBeInstanceOf(Date)
    expect(invite.updatedAt).toBeInstanceOf(Date)
  })

  it('respects token override', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Token Override Club' })

    // Act
    const invite = await createClubInvite({
      clubId: club.id,
      createdByUserId: CREATOR_ID,
      token: 'explicit-token-override',
    })

    // Assert
    expect(invite.token).toBe('explicit-token-override')
  })

  it('respects expiresAt override', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Expiry Club' })
    const customExpiry = new Date('2030-12-31T00:00:00Z')

    // Act
    const invite = await createClubInvite({
      clubId: club.id,
      createdByUserId: CREATOR_ID,
      expiresAt: customExpiry,
    })

    // Assert: allow 1-second tolerance for clock drift
    expect(Math.abs(invite.expiresAt!.getTime() - customExpiry.getTime())).toBeLessThan(1000)
  })

  it('respects revokedAt override', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Revoked Club' })
    const revokedAt = new Date('2026-01-01T00:00:00Z')

    // Act
    const invite = await createClubInvite({
      clubId: club.id,
      createdByUserId: CREATOR_ID,
      revokedAt,
    })

    // Assert
    expect(invite.revokedAt).not.toBeNull()
    expect(Math.abs(invite.revokedAt!.getTime() - revokedAt.getTime())).toBeLessThan(1000)
  })

  it('produces two distinct rows with distinct tokens when called twice', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Multi Invite Club' })

    // Act
    const a = await createClubInvite({ clubId: club.id, createdByUserId: CREATOR_ID })
    const b = await createClubInvite({ clubId: club.id, createdByUserId: CREATOR_ID })

    // Assert
    expect(a.id).not.toBe(b.id)
    expect(a.token).not.toBe(b.token)
  })

  it('rejects a duplicate token with a 23505 unique-violation error', async () => {
    // Arrange
    const club = await createClub({ ownerId: CREATOR_ID, name: 'Dupe Token Club' })
    await createClubInvite({
      clubId: club.id,
      createdByUserId: CREATOR_ID,
      token: 'dup-token',
    })

    // Act & Assert
    await expect(
      createClubInvite({
        clubId: club.id,
        createdByUserId: CREATOR_ID,
        token: 'dup-token',
      }),
    ).rejects.toMatchObject({ code: '23505' })
  })
})
