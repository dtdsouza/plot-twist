import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
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
import { ClubEntity } from '../../persistence/entity/club.entity'
import { MembershipEntity } from '../../persistence/entity/membership.entity'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('Membership unique (clubId, userId) constraint (integration)', () => {
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
      providers: [],
    }).compile()
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

  it('rejects a second membership insert for the same (clubId, userId) with a unique-constraint violation', async () => {
    // Arrange
    const user = await createUser({
      email: 'dupe@membership.int',
      displayName: 'Dupe Member',
    })
    const club = await createClub({ ownerId: user.id, name: 'Dupe Club' })
    await createMembership({ clubId: club.id, userId: user.id, role: 'owner' })

    // Act & Assert
    let thrownError: Error | undefined
    try {
      await createMembership({ clubId: club.id, userId: user.id, role: 'member' })
    } catch (err) {
      thrownError = err as Error
    }

    expect(thrownError).toBeDefined()
    // Postgres unique violation error code is 23505
    expect((thrownError as NodeJS.ErrnoException & { code: string }).code).toBe('23505')
  })
})
