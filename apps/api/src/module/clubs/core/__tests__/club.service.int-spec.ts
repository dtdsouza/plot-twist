import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ClubService } from '../club.service'
import { ClubEntity } from '../../persistence/entity/club.entity'
import { MembershipEntity } from '../../persistence/entity/membership.entity'
import { ClubRepository } from '../../persistence/repository/club.repository'
import { MembershipRepository } from '../../persistence/repository/membership.repository'
import { closeTestPool } from '@module/shared/test-support'
import {
  CLUBS_TEST_ENTITIES,
  createClub,
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

describe('ClubService (integration)', () => {
  let service: ClubService
  let dataSource: DataSource
  let module: TestingModule

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
        TypeOrmModule.forFeature([ClubEntity, MembershipEntity]),
      ],
      providers: [ClubService, ClubRepository, MembershipRepository],
    }).compile()

    service = module.get<ClubService>(ClubService)
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

  describe('create — atomic transaction', () => {
    it('happy path: persists both club row and owner membership row', async () => {
      // Arrange
      const user = await createUser({ email: 'create@clubs.int', displayName: 'Creator' })
      const dto = { name: 'Book Worms', description: 'A group' }

      // Act
      const club = await service.create(user.id, dto)

      // Assert
      const clubRows = await dataSource.query(
        `SELECT * FROM clubs.club WHERE id = $1`,
        [club.id],
      )
      expect(clubRows).toHaveLength(1)
      expect(clubRows[0].name).toBe('Book Worms')
      expect(clubRows[0].ownerId).toBe(user.id)

      const memberRows = await dataSource.query(
        `SELECT * FROM clubs.membership WHERE "clubId" = $1 AND "userId" = $2`,
        [club.id, user.id],
      )
      expect(memberRows).toHaveLength(1)
      expect(memberRows[0].role).toBe('owner')
    })

    it('rollback: no club or membership row persists when an error occurs mid-transaction', async () => {
      // Arrange
      const user = await createUser({ email: 'rollback@clubs.int', displayName: 'Rollback User' })
      const dto = { name: 'Rollback Club' }

      // Inject failure: spy on dataSource.transaction so the membership save throws.
      // We execute the real transaction but intercept manager.save on its second call.
      const originalTransaction = dataSource.transaction.bind(dataSource)
      jest
        .spyOn(dataSource, 'transaction')
        .mockImplementationOnce(
          async (cb: (manager: DataSource['manager']) => Promise<unknown>) => {
            return originalTransaction(async (manager: DataSource['manager']) => {
              const origSave = manager.save.bind(manager)
              let saveCount = 0
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              jest.spyOn(manager, 'save').mockImplementation(async (...args: any[]) => {
                saveCount++
                if (saveCount === 2) {
                  throw new Error('Simulated membership insert failure')
                }
                return origSave(...args)
              })
              return cb(manager)
            })
          },
        )

      // Act & Assert
      await expect(service.create(user.id, dto)).rejects.toThrow(
        'Simulated membership insert failure',
      )

      // No orphan club row should remain
      const clubRows = await dataSource.query(
        `SELECT * FROM clubs.club WHERE "ownerId" = $1 AND name = $2`,
        [user.id, 'Rollback Club'],
      )
      expect(clubRows).toHaveLength(0)

      jest.restoreAllMocks()
    })
  })

  describe('listForMember — selectivity', () => {
    it('returns only the clubs the caller is a member of, with correct roles', async () => {
      // Arrange
      const u1 = await createUser({ email: 'u1@clubs.int', displayName: 'U1' })
      const u2 = await createUser({ email: 'u2@clubs.int', displayName: 'U2' })

      // u1 owns club A
      const clubA = await createClub({ ownerId: u1.id, name: 'Club A' })
      await createMembership({ clubId: clubA.id, userId: u1.id, role: 'owner' })

      // u1 is a member of club B (owned by u2)
      const clubB = await createClub({ ownerId: u2.id, name: 'Club B' })
      await createMembership({ clubId: clubB.id, userId: u2.id, role: 'owner' })
      await createMembership({ clubId: clubB.id, userId: u1.id, role: 'member' })

      // u2 owns club C (u1 is not a member)
      const clubC = await createClub({ ownerId: u2.id, name: 'Club C' })
      await createMembership({ clubId: clubC.id, userId: u2.id, role: 'owner' })

      // Act
      const result = await service.listForMember(u1.id)

      // Assert
      expect(result).toHaveLength(2)
      const ids = result.map((r) => r.club.id)
      expect(ids).toContain(clubA.id)
      expect(ids).toContain(clubB.id)
      expect(ids).not.toContain(clubC.id)

      const roleA = result.find((r) => r.club.id === clubA.id)?.role
      const roleB = result.find((r) => r.club.id === clubB.id)?.role
      expect(roleA).toBe('owner')
      expect(roleB).toBe('member')
    })

    it('returns an empty array for a user with no memberships', async () => {
      // Arrange
      const u = await createUser({ email: 'nomember@clubs.int', displayName: 'No Member' })

      // Act
      const result = await service.listForMember(u.id)

      // Assert
      expect(result).toEqual([])
    })
  })

  describe('findByIdForMember', () => {
    it('throws NotFoundException for a non-member', async () => {
      // Arrange
      const u1 = await createUser({ email: 'owner2@clubs.int', displayName: 'Owner2' })
      const u2 = await createUser({ email: 'other2@clubs.int', displayName: 'Other2' })
      const club = await createClub({ ownerId: u1.id, name: 'Private Club' })
      await createMembership({ clubId: club.id, userId: u1.id, role: 'owner' })

      // Act & Assert
      await expect(service.findByIdForMember(club.id, u2.id)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('returns the club and role for a member', async () => {
      // Arrange
      const u1 = await createUser({ email: 'member-ok@clubs.int', displayName: 'Owner3' })
      const club = await createClub({ ownerId: u1.id, name: 'My Club' })
      await createMembership({ clubId: club.id, userId: u1.id, role: 'owner' })

      // Act
      const result = await service.findByIdForMember(club.id, u1.id)

      // Assert
      expect(result.club.id).toBe(club.id)
      expect(result.role).toBe('owner')
    })
  })

  describe('global invariant', () => {
    it('every club row has exactly one owner membership matching its ownerId', async () => {
      // Arrange: create 3 clubs via the service (which enforces the invariant)
      const users = await Promise.all([
        createUser({ email: 'inv1@clubs.int', displayName: 'Inv1' }),
        createUser({ email: 'inv2@clubs.int', displayName: 'Inv2' }),
        createUser({ email: 'inv3@clubs.int', displayName: 'Inv3' }),
      ])

      await service.create(users[0].id, { name: 'Invariant Club A' })
      await service.create(users[1].id, { name: 'Invariant Club B' })
      await service.create(users[2].id, { name: 'Invariant Club C' })

      // Act: query for any club that has no owner membership matching ownerId
      const orphans = await dataSource.query(
        `SELECT c.id
         FROM clubs.club c
         WHERE NOT EXISTS (
           SELECT 1
           FROM clubs.membership m
           WHERE m."clubId" = c.id
             AND m.role = 'owner'
             AND m."userId" = c."ownerId"
         )`,
      )

      // Assert
      expect(orphans).toHaveLength(0)
    })
  })
})
