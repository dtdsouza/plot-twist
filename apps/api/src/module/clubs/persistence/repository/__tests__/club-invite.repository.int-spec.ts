import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ClubInviteRepository } from '../club-invite.repository'
import { MembershipRepository } from '../membership.repository'
import { ClubEntity } from '../../entity/club.entity'
import { MembershipEntity } from '../../entity/membership.entity'
import { ClubInviteEntity } from '../../entity/club-invite.entity'
import { closeTestPool } from '@module/shared/test-support'
import {
  CLUBS_TEST_ENTITIES,
  createClub,
  createClubInvite,
  createMembership,
  ensureClubsSchema,
  truncateClubs,
} from '@module/clubs/test-support'
import {
  createUser,
  ensureIdentitySchema,
  truncateIdentity,
} from '@module/identity/test-support'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

// A fixed user UUID (no cross-schema FK on club_invite, so any UUID works)
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

describe('ClubInviteRepository (integration)', () => {
  let module: TestingModule
  let dataSource: DataSource
  let clubInviteRepository: ClubInviteRepository
  let membershipRepository: MembershipRepository

  beforeAll(async () => {
    await ensureIdentitySchema()
    await ensureClubsSchema()

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [...CLUBS_TEST_ENTITIES],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ClubEntity, MembershipEntity, ClubInviteEntity]),
      ],
      providers: [ClubInviteRepository, MembershipRepository],
    }).compile()

    clubInviteRepository = module.get<ClubInviteRepository>(ClubInviteRepository)
    membershipRepository = module.get<MembershipRepository>(MembershipRepository)
    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    await truncateClubs()
    await truncateIdentity()
  })

  afterAll(async () => {
    await truncateClubs()
    await truncateIdentity()
    await module?.close()
    await closeTestPool()
  })

  describe('findActiveByClub', () => {
    it('returns the active invite for a club', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Active Club' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: USER_ID })

      // Act
      const result = await clubInviteRepository.findActiveByClub(club.id)

      // Assert
      expect(result).not.toBeNull()
      expect(result!.id).toBe(invite.id)
      expect(result!.token).toBe(invite.token)
    })

    it('returns null when invite is revoked', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Revoked Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        revokedAt: new Date(Date.now() - 1000),
      })

      // Act
      const result = await clubInviteRepository.findActiveByClub(club.id)

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when invite is expired', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Expired Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        expiresAt: new Date(Date.now() - 1000),
      })

      // Act
      const result = await clubInviteRepository.findActiveByClub(club.id)

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when club has no invites', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'No Invite Club' })

      // Act
      const result = await clubInviteRepository.findActiveByClub(club.id)

      // Assert
      expect(result).toBeNull()
    })

    it('ignores revoked invites and returns active one if both exist', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Mixed Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        revokedAt: new Date(Date.now() - 1000),
        token: 'old-revoked-token',
      })
      const activeInvite = await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        token: 'current-active-token',
      })

      // Act
      const result = await clubInviteRepository.findActiveByClub(club.id)

      // Assert
      expect(result).not.toBeNull()
      expect(result!.token).toBe(activeInvite.token)
    })
  })

  describe('findActiveByToken', () => {
    it('returns the active invite for a valid token', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Token Club' })
      const invite = await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        token: 'valid-token-abc',
      })

      // Act
      const result = await clubInviteRepository.findActiveByToken('valid-token-abc')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.id).toBe(invite.id)
    })

    it('returns null for a revoked token', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Revoked Token Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        token: 'revoked-token-xyz',
        revokedAt: new Date(Date.now() - 1000),
      })

      // Act
      const result = await clubInviteRepository.findActiveByToken('revoked-token-xyz')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for an expired token', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Expired Token Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        token: 'expired-token-xyz',
        expiresAt: new Date(Date.now() - 1000),
      })

      // Act
      const result = await clubInviteRepository.findActiveByToken('expired-token-xyz')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for an unknown token', async () => {
      // Act
      const result = await clubInviteRepository.findActiveByToken('nonexistent-token-000')

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('revokeActiveForClub', () => {
    it('sets revokedAt on the active invite within a transaction', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Revoke Club' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: USER_ID })

      // Act
      await dataSource.transaction(async (manager) => {
        await clubInviteRepository.revokeActiveForClub(manager, club.id)
      })

      // Assert: active check should now return null
      const result = await clubInviteRepository.findActiveByClub(club.id)
      expect(result).toBeNull()

      // Verify the row itself has revokedAt set
      const rows = await dataSource.query(
        `SELECT "revokedAt" FROM clubs."club_invite" WHERE id = $1`,
        [invite.id],
      )
      expect(rows[0].revokedAt).not.toBeNull()
    })

    it('is a no-op when no active invite exists', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'No Active Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        revokedAt: new Date(Date.now() - 1000),
      })

      // Act — should not throw
      await expect(
        dataSource.transaction(async (manager) => {
          await clubInviteRepository.revokeActiveForClub(manager, club.id)
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('token uniqueness constraint', () => {
    it('rejects a second insert with the same token (23505 unique violation)', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Unique Token Club' })
      await createClubInvite({
        clubId: club.id,
        createdByUserId: USER_ID,
        token: 'duplicate-token-test',
      })

      // Act & Assert
      let thrownError: Error | undefined
      try {
        await createClubInvite({
          clubId: club.id,
          createdByUserId: USER_ID,
          token: 'duplicate-token-test',
        })
      } catch (err) {
        thrownError = err as Error
      }

      expect(thrownError).toBeDefined()
      expect((thrownError as NodeJS.ErrnoException & { code: string }).code).toBe('23505')
    })
  })

  describe('membership operations', () => {
    it('createMemberMembership adds a member row, removeMembership removes it', async () => {
      // Arrange
      const owner = await createUser({ email: 'ms-owner@repo.int', displayName: 'MSOwner' })
      const club = await createClub({ ownerId: owner.id, name: 'Membership Test Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      const member = await createUser({ email: 'ms-member@repo.int', displayName: 'MSMember' })

      // Act: create member
      await membershipRepository.createMemberMembership(club.id, member.id)

      // Assert: membership exists
      const roleAfterJoin = await membershipRepository.findRoleForUser(club.id, member.id)
      expect(roleAfterJoin).toBe('member')

      // Act: remove member
      await membershipRepository.removeMembership(club.id, member.id)

      // Assert: membership removed
      const roleAfterLeave = await membershipRepository.findRoleForUser(club.id, member.id)
      expect(roleAfterLeave).toBeNull()
    })

    it('enforces unique (clubId, userId) constraint on createMemberMembership', async () => {
      // Arrange
      const club = await createClub({ ownerId: USER_ID, name: 'Dupe Membership Club' })
      await createMembership({ clubId: club.id, userId: USER_ID, role: 'owner' })

      // Act & Assert: second insert for same user should fail with 23505
      let thrownError: Error | undefined
      try {
        await membershipRepository.createMemberMembership(club.id, USER_ID)
      } catch (err) {
        thrownError = err as Error
      }

      expect(thrownError).toBeDefined()
      expect((thrownError as NodeJS.ErrnoException & { code: string }).code).toBe('23505')
    })
  })
})
