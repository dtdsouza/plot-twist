import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import * as request from 'supertest'
import { ClubsController } from '../http/controller/clubs.controller'
import { ClubService } from '../core/club.service'
import { ClubCoverService } from '../core/club-cover.service'
import { ClubEntity } from '../persistence/entity/club.entity'
import { MembershipEntity } from '../persistence/entity/membership.entity'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import { JwtAuthGuard } from '@module/shared/auth'
import { StorageClient } from '@module/shared/storage'
import { STORAGE_CONFIG_KEY } from '@module/shared/config'
import { ConfigService } from '@nestjs/config'
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

const FAKE_STORAGE_CONFIG = {
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:4566',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  avatarsBucket: 'plot-twist-avatars',
  publicUrlBase: null,
  maxAvatarSizeBytes: 2_097_152,
  maxAvatarDimension: 2048,
  avatarAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  clubCoversBucket: 'plot-twist-club-covers',
  maxClubCoverSizeBytes: 5_242_880,
  maxClubCoverDimension: 4096,
  clubCoverAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  presignedPostTtlSeconds: 300,
}

describe('ClubsController (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let jwtService: JwtService

  beforeAll(async () => {
    await ensureIdentitySchema()
    await ensureClubsSchema()

    // Minimal StorageClient mock — cover endpoints are tested separately in club-cover.e2e-spec.ts
    const mockStorageClient: jest.Mocked<StorageClient> = {
      createPresignedPost: jest.fn().mockResolvedValue({
        url: 'https://s3.example/upload',
        fields: {},
        key: 'clubs/test/cover/pending/fake-id',
        expiresAt: new Date(Date.now() + 300_000),
      }),
      headObject: jest.fn(),
      getObjectRange: jest.fn(),
      copyObject: jest.fn(),
      deleteObject: jest.fn(),
      buildPublicUrl: jest.fn(),
    } as unknown as jest.Mocked<StorageClient>

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === STORAGE_CONFIG_KEY) return FAKE_STORAGE_CONFIG
        throw new Error(`unexpected config key: ${key}`)
      }),
    }

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
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ClubsController],
      providers: [
        ClubService,
        ClubCoverService,
        ClubRepository,
        MembershipRepository,
        JwtAuthGuard,
        { provide: StorageClient, useValue: mockStorageClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    await app.init()

    jwtService = module.get<JwtService>(JwtService)
  })

  beforeEach(async () => {
    await truncateClubs()
    await truncateIdentity()
  })

  afterAll(async () => {
    await truncateClubs()
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
  })

  describe('POST /api/clubs', () => {
    it('201 — creates club with owner membership', async () => {
      // Arrange
      const user = await createUser({ email: 'owner@clubs.e2e', displayName: 'Owner' })
      const token = jwtService.sign({ sub: user.id, email: user.email })

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/clubs')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Book Worms', description: 'A reading group' })
        .expect(201)

      // Assert
      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe('Book Worms')
      expect(response.body.role).toBe('owner')
      expect(response.body.ownerId).toBe(user.id)
    })

    it('400 — rejects empty name', async () => {
      // Arrange
      const user = await createUser({ email: 'owner400@clubs.e2e', displayName: 'Owner400' })
      const token = jwtService.sign({ sub: user.id, email: user.email })

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/clubs')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400)
    })

    it('401 — without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/clubs')
        .send({ name: 'Unauthorized Club' })
        .expect(401)
    })

    it('400 — rejects coverImageUrl field via forbidNonWhitelisted', async () => {
      // Arrange
      const user = await createUser({ email: 'cover400@clubs.e2e', displayName: 'CoverUser' })
      const token = jwtService.sign({ sub: user.id, email: user.email })

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/clubs')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Valid Name', coverImageUrl: 'https://bad.example/img.jpg' })
        .expect(400)
    })
  })

  describe('GET /api/clubs', () => {
    it("200 — returns only the caller's clubs with roles", async () => {
      // Arrange
      const u1 = await createUser({ email: 'list1@clubs.e2e', displayName: 'List1' })
      const u2 = await createUser({ email: 'list2@clubs.e2e', displayName: 'List2' })
      const token1 = jwtService.sign({ sub: u1.id, email: u1.email })

      const clubA = await createClub({ ownerId: u1.id, name: 'Club A' })
      await createMembership({ clubId: clubA.id, userId: u1.id, role: 'owner' })
      const clubB = await createClub({ ownerId: u2.id, name: 'Club B' })
      await createMembership({ clubId: clubB.id, userId: u2.id, role: 'owner' })
      await createMembership({ clubId: clubB.id, userId: u1.id, role: 'member' })
      const clubC = await createClub({ ownerId: u2.id, name: 'Club C' })
      await createMembership({ clubId: clubC.id, userId: u2.id, role: 'owner' })

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/clubs')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200)

      // Assert
      expect(response.body).toHaveLength(2)
      const ids = response.body.map((c: { id: string }) => c.id)
      expect(ids).toContain(clubA.id)
      expect(ids).toContain(clubB.id)
      expect(ids).not.toContain(clubC.id)
    })

    it('200 — returns empty array for user with no memberships', async () => {
      // Arrange
      const user = await createUser({ email: 'empty@clubs.e2e', displayName: 'Empty' })
      const token = jwtService.sign({ sub: user.id, email: user.email })

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/clubs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body).toEqual([])
    })
  })

  describe('GET /api/clubs/:id', () => {
    it('200 — member sees the club with their role', async () => {
      // Arrange
      const owner = await createUser({ email: 'getsingle@clubs.e2e', displayName: 'GetSingle' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Single Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      const response = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Assert
      expect(response.body.id).toBe(club.id)
      expect(response.body.name).toBe('Single Club')
      expect(response.body.role).toBe('owner')
    })

    it('404 — non-member gets 404 (not 403)', async () => {
      // Arrange
      const owner = await createUser({ email: 'nm-owner@clubs.e2e', displayName: 'NmOwner' })
      const nonMember = await createUser({ email: 'nm-user@clubs.e2e', displayName: 'NmUser' })
      const tokenNm = jwtService.sign({ sub: nonMember.id, email: nonMember.email })
      const club = await createClub({ ownerId: owner.id, name: 'Private Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert — non-member sees 404, not 403
      await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${tokenNm}`)
        .expect(404)
    })

    it('404 — unknown UUID', async () => {
      // Arrange
      const user = await createUser({ email: 'unknown@clubs.e2e', displayName: 'Unknown' })
      const token = jwtService.sign({ sub: user.id, email: user.email })

      // Act & Assert
      await request(app.getHttpServer())
        .get('/api/clubs/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })

  describe('PATCH /api/clubs/:id', () => {
    it('200 — owner updates name successfully', async () => {
      // Arrange
      const owner = await createUser({ email: 'patch-owner@clubs.e2e', displayName: 'PatchOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Original Name' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      const response = await request(app.getHttpServer())
        .patch(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' })
        .expect(200)

      // Assert
      expect(response.body.name).toBe('New Name')
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'patch-nm-owner@clubs.e2e', displayName: 'PNMOwner' })
      const member = await createUser({ email: 'patch-nm-member@clubs.e2e', displayName: 'PNMMember' })
      const tokenMember = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Patch Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .patch(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ name: 'Hacked Name' })
        .expect(403)
    })

    it('400 — rejects body including coverImageUrl field', async () => {
      // Arrange
      const owner = await createUser({ email: 'patch-cover@clubs.e2e', displayName: 'PatchCover' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Cover Patch Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert — coverImageUrl is not whitelisted in UpdateClubDto
      await request(app.getHttpServer())
        .patch(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ coverImageUrl: 'https://example.com/cover.jpg' })
        .expect(400)
    })
  })

  describe('DELETE /api/clubs/:id', () => {
    it('204 — owner deletes club and cascade removes memberships', async () => {
      // Arrange
      const owner = await createUser({ email: 'del-owner@clubs.e2e', displayName: 'DelOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Delete Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      await request(app.getHttpServer())
        .delete(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204)

      // Assert — club no longer accessible
      await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'del-nm-owner@clubs.e2e', displayName: 'DelNMOwner' })
      const member = await createUser({ email: 'del-nm-member@clubs.e2e', displayName: 'DelNMMember' })
      const tokenMember = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Del Nm Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403)
    })
  })
})
