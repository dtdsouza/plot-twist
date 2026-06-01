import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import * as request from 'supertest'
import { ClubsController } from '../http/controller/clubs.controller'
import { ClubInviteController } from '../http/controller/club-invite.controller'
import { ClubService } from '../core/club.service'
import { ClubCoverService } from '../core/club-cover.service'
import { ClubInviteService } from '../core/club-invite.service'
import { ClubEntity } from '../persistence/entity/club.entity'
import { MembershipEntity } from '../persistence/entity/membership.entity'
import { ClubInviteEntity } from '../persistence/entity/club-invite.entity'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import { ClubInviteRepository } from '../persistence/repository/club-invite.repository'
import { JwtAuthGuard } from '@module/shared/auth'
import { StorageClient } from '@module/shared/storage'
import { EmailClient } from '@module/shared/mail'
import { STORAGE_CONFIG_KEY, CLUBS_CONFIG_KEY } from '@module/shared/config'
import { ConfigService } from '@nestjs/config'
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

const FAKE_CLUBS_CONFIG = {
  inviteUrl: 'http://localhost:4200/clubs/join',
  inviteExpiryDays: 14,
}

describe('ClubInviteController (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let jwtService: JwtService
  let mockEmailClient: jest.Mocked<EmailClient>

  beforeAll(async () => {
    await ensureIdentitySchema()
    await ensureClubsSchema()

    mockEmailClient = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailClient>

    const mockStorageClient: jest.Mocked<StorageClient> = {
      createPresignedPost: jest.fn(),
      headObject: jest.fn(),
      getObjectRange: jest.fn(),
      copyObject: jest.fn(),
      deleteObject: jest.fn(),
      buildPublicUrl: jest.fn(),
    } as unknown as jest.Mocked<StorageClient>

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === STORAGE_CONFIG_KEY) return FAKE_STORAGE_CONFIG
        if (key === CLUBS_CONFIG_KEY) return FAKE_CLUBS_CONFIG
        throw new Error(`unexpected config key in test: ${key}`)
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
        TypeOrmModule.forFeature([ClubEntity, MembershipEntity, ClubInviteEntity]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ClubsController, ClubInviteController],
      providers: [
        ClubService,
        ClubCoverService,
        ClubInviteService,
        ClubRepository,
        MembershipRepository,
        ClubInviteRepository,
        JwtAuthGuard,
        { provide: StorageClient, useValue: mockStorageClient },
        { provide: EmailClient, useValue: mockEmailClient },
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
    mockEmailClient.send.mockClear()
  })

  afterAll(async () => {
    await truncateClubs()
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
  })

  // ---------------------------------------------------------------------------
  // GET /:id/invite — get or lazily create the active invite
  // ---------------------------------------------------------------------------
  describe('GET /api/clubs/:id/invite', () => {
    it('200 — owner gets the active invite with token, url, expiresAt', async () => {
      // Arrange
      const owner = await createUser({ email: 'get-invite-owner@e2e', displayName: 'GIOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Invite Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      const response = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Assert
      expect(response.body.token).toBeDefined()
      expect(response.body.url).toContain(response.body.token)
      expect(response.body.url).toContain('http://localhost:4200/clubs/join')
    })

    it('200 — second GET returns the SAME token (idempotent get-or-create)', async () => {
      // Arrange
      const owner = await createUser({ email: 'idempotent-owner@e2e', displayName: 'IdempOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Idempotent Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      const first = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const second = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Assert
      expect(first.body.token).toBe(second.body.token)
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'gi-owner@e2e', displayName: 'GOwner' })
      const member = await createUser({ email: 'gi-member@e2e', displayName: 'GMember' })
      const memberToken = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Owner Only Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403)
    })

    it('404 — non-member gets 404', async () => {
      // Arrange
      const owner = await createUser({ email: 'gi-nm-owner@e2e', displayName: 'NMOwner' })
      const nonMember = await createUser({ email: 'gi-nm-user@e2e', displayName: 'NMUser' })
      const nmToken = jwtService.sign({ sub: nonMember.id, email: nonMember.email })
      const club = await createClub({ ownerId: owner.id, name: 'Private Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${nmToken}`)
        .expect(404)
    })

    it('401 — unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/clubs/00000000-0000-0000-0000-000000000000/invite')
        .expect(401)
    })
  })

  // ---------------------------------------------------------------------------
  // POST /:id/invite/rotate
  // ---------------------------------------------------------------------------
  describe('POST /api/clubs/:id/invite/rotate', () => {
    it('200 — returns a DIFFERENT token than the previous active invite', async () => {
      // Arrange
      const owner = await createUser({ email: 'rotate-owner@e2e', displayName: 'RotOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Rotate Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Create initial invite
      const first = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Act
      const rotated = await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/rotate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Assert
      expect(rotated.body.token).toBeDefined()
      expect(rotated.body.token).not.toBe(first.body.token)
      expect(rotated.body.url).toContain(rotated.body.token)
    })

    it('410 — old token preview returns Gone after rotation', async () => {
      // Arrange
      const owner = await createUser({ email: 'rotate-410-owner@e2e', displayName: 'RotGoneOwner' })
      const token = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Rotate Gone Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      const first = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const oldToken: string = first.body.token

      // Rotate
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/rotate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Act & Assert: old token is now gone
      await request(app.getHttpServer())
        .get(`/api/clubs/join/${oldToken}`)
        .expect(410)
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'rotate-403-owner@e2e', displayName: 'Rot403Owner' })
      const member = await createUser({ email: 'rotate-403-member@e2e', displayName: 'Rot403Member' })
      const memberToken = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Rotate 403 Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/rotate`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403)
    })
  })

  // ---------------------------------------------------------------------------
  // DELETE /:id/invite
  // ---------------------------------------------------------------------------
  describe('DELETE /api/clubs/:id/invite', () => {
    it('204 — owner revokes the invite', async () => {
      // Arrange
      const owner = await createUser({ email: 'revoke-owner@e2e', displayName: 'RevokeOwner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Revoke Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      const invite = await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)

      const revokedToken: string = invite.body.token

      // Act
      await request(app.getHttpServer())
        .delete(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204)

      // Assert: preview of revoked token returns 410
      await request(app.getHttpServer())
        .get(`/api/clubs/join/${revokedToken}`)
        .expect(410)
    })

    it('204 — no-op when no active invite exists (still returns 204)', async () => {
      // Arrange
      const owner = await createUser({ email: 'revoke-noop-owner@e2e', displayName: 'RevokeNoopOwner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Revoke Noop Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert (no invite exists — should still be 204)
      await request(app.getHttpServer())
        .delete(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204)
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'revoke-403-owner@e2e', displayName: 'Rev403Owner' })
      const member = await createUser({ email: 'revoke-403-member@e2e', displayName: 'Rev403Member' })
      const memberToken = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Revoke 403 Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/api/clubs/${club.id}/invite`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403)
    })
  })

  // ---------------------------------------------------------------------------
  // POST /:id/invite/email
  // ---------------------------------------------------------------------------
  describe('POST /api/clubs/:id/invite/email', () => {
    it('202 — owner sends invite emails', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-invite-owner@e2e', displayName: 'EmailOwner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emails: ['alice@example.com', 'bob@example.com'] })
        .expect(202)

      // Assert: both emails were attempted
      expect(mockEmailClient.send).toHaveBeenCalledTimes(2)
    })

    it('400 — empty emails array', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-400-owner@e2e', displayName: 'Email400Owner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email 400 Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emails: [] })
        .expect(400)
    })

    it('400 — more than 20 emails', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-max-owner@e2e', displayName: 'EmailMaxOwner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email Max Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      const tooManyEmails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`)

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emails: tooManyEmails })
        .expect(400)
    })

    it('400 — contains a non-email string', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-invalid-owner@e2e', displayName: 'EmailInvalidOwner' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email Invalid Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emails: ['valid@example.com', 'not-an-email'] })
        .expect(400)
    })

    it('403 — non-owner member is rejected', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-403-owner@e2e', displayName: 'Email403Owner' })
      const member = await createUser({ email: 'email-403-member@e2e', displayName: 'Email403Member' })
      const memberToken = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email 403 Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emails: ['someone@example.com'] })
        .expect(403)
    })

    it('404 — non-member gets 404', async () => {
      // Arrange
      const owner = await createUser({ email: 'email-404-owner@e2e', displayName: 'Email404Owner' })
      const nonMember = await createUser({ email: 'email-404-nm@e2e', displayName: 'Email404NM' })
      const nmToken = jwtService.sign({ sub: nonMember.id, email: nonMember.email })
      const club = await createClub({ ownerId: owner.id, name: 'Email 404 Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/invite/email`)
        .set('Authorization', `Bearer ${nmToken}`)
        .send({ emails: ['someone@example.com'] })
        .expect(404)
    })
  })

  // ---------------------------------------------------------------------------
  // GET /join/:token — public invite preview (no auth)
  // ---------------------------------------------------------------------------
  describe('GET /api/clubs/join/:token', () => {
    it('200 — valid token returns preview shape (no auth required)', async () => {
      // Arrange
      const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      const club = await createClub({ ownerId: userId, name: 'Preview Club' })
      await createMembership({ clubId: club.id, userId, role: 'owner' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: userId })

      // Act — no Authorization header
      const response = await request(app.getHttpServer())
        .get(`/api/clubs/join/${invite.token}`)
        .expect(200)

      // Assert
      expect(response.body.clubId).toBe(club.id)
      expect(response.body.name).toBe('Preview Club')
      expect(response.body.memberCount).toBeGreaterThanOrEqual(1)
    })

    it('410 — revoked token returns Gone', async () => {
      // Arrange
      const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      const club = await createClub({ ownerId: userId, name: 'Revoked Preview Club' })
      const invite = await createClubInvite({
        clubId: club.id,
        createdByUserId: userId,
        revokedAt: new Date(Date.now() - 1000),
      })

      // Act & Assert
      await request(app.getHttpServer())
        .get(`/api/clubs/join/${invite.token}`)
        .expect(410)
    })

    it('410 — expired token returns Gone', async () => {
      // Arrange
      const userId = 'eeeeeeee-eeee-eeee-eeee-000000000000'
      const club = await createClub({ ownerId: userId, name: 'Expired Preview Club' })
      const invite = await createClubInvite({
        clubId: club.id,
        createdByUserId: userId,
        expiresAt: new Date(Date.now() - 1000),
      })

      // Act & Assert
      await request(app.getHttpServer())
        .get(`/api/clubs/join/${invite.token}`)
        .expect(410)
    })

    it('410 — unknown token returns Gone', async () => {
      await request(app.getHttpServer())
        .get('/api/clubs/join/totally-unknown-token-that-does-not-exist')
        .expect(410)
    })
  })

  // ---------------------------------------------------------------------------
  // POST /join/:token — authenticated join (redeem)
  // ---------------------------------------------------------------------------
  describe('POST /api/clubs/join/:token', () => {
    it('200 — new member joins and gets club response', async () => {
      // Arrange
      const ownerId = 'ffffffff-ffff-ffff-ffff-000000000001'
      const club = await createClub({ ownerId, name: 'Join Club' })
      await createMembership({ clubId: club.id, userId: ownerId, role: 'owner' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: ownerId })

      const joiner = await createUser({ email: 'joiner@e2e', displayName: 'Joiner' })
      const joinerToken = jwtService.sign({ sub: joiner.id, email: joiner.email })

      // Act
      const response = await request(app.getHttpServer())
        .post(`/api/clubs/join/${invite.token}`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .expect(200)

      // Assert
      expect(response.body.id).toBe(club.id)
      expect(response.body.name).toBe('Join Club')
      expect(response.body.role).toBe('member')
    })

    it('200 — calling again is idempotent (already member returns 200)', async () => {
      // Arrange
      const ownerId = 'ffffffff-ffff-ffff-ffff-000000000002'
      const club = await createClub({ ownerId, name: 'Join Idempotent Club' })
      await createMembership({ clubId: club.id, userId: ownerId, role: 'owner' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: ownerId })

      const joiner = await createUser({ email: 'joiner-idempotent@e2e', displayName: 'JoinerIdem' })
      const joinerToken = jwtService.sign({ sub: joiner.id, email: joiner.email })

      // First join
      await request(app.getHttpServer())
        .post(`/api/clubs/join/${invite.token}`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .expect(200)

      // Second join — idempotent
      const response = await request(app.getHttpServer())
        .post(`/api/clubs/join/${invite.token}`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .expect(200)

      // Assert
      expect(response.body.id).toBe(club.id)
    })

    it('410 — revoked token returns Gone', async () => {
      // Arrange
      const ownerId = 'ffffffff-ffff-ffff-ffff-000000000003'
      const club = await createClub({ ownerId, name: 'Join Revoked Club' })
      const invite = await createClubInvite({
        clubId: club.id,
        createdByUserId: ownerId,
        revokedAt: new Date(Date.now() - 1000),
      })

      const joiner = await createUser({ email: 'joiner-revoked@e2e', displayName: 'JoinerRevoked' })
      const joinerToken = jwtService.sign({ sub: joiner.id, email: joiner.email })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/join/${invite.token}`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .expect(410)
    })

    it('401 — unauthenticated request is rejected', async () => {
      // Arrange
      const ownerId = 'ffffffff-ffff-ffff-ffff-000000000004'
      const club = await createClub({ ownerId, name: 'Join Unauth Club' })
      const invite = await createClubInvite({ clubId: club.id, createdByUserId: ownerId })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/join/${invite.token}`)
        .expect(401)
    })
  })

  // ---------------------------------------------------------------------------
  // POST /:id/leave
  // ---------------------------------------------------------------------------
  describe('POST /api/clubs/:id/leave', () => {
    it('204 — regular member can leave; is no longer a member afterwards', async () => {
      // Arrange
      const owner = await createUser({ email: 'leave-owner@e2e', displayName: 'LeaveOwner' })
      const member = await createUser({ email: 'leave-member@e2e', displayName: 'LeaveMember' })
      const memberToken = jwtService.sign({ sub: member.id, email: member.email })
      const club = await createClub({ ownerId: owner.id, name: 'Leave Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
      await createMembership({ clubId: club.id, userId: member.id, role: 'member' })

      // Act
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/leave`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(204)

      // Assert: member can no longer see the club (404 for non-member)
      await request(app.getHttpServer())
        .get(`/api/clubs/${club.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404)
    })

    it('403 — owner cannot leave', async () => {
      // Arrange
      const owner = await createUser({ email: 'leave-owner-403@e2e', displayName: 'LeaveOwner403' })
      const ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })
      const club = await createClub({ ownerId: owner.id, name: 'Leave Owner Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/leave`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403)
    })

    it('404 — non-member trying to leave gets 404', async () => {
      // Arrange
      const owner = await createUser({ email: 'leave-nm-owner@e2e', displayName: 'LeaveNMOwner' })
      const nonMember = await createUser({ email: 'leave-nm-user@e2e', displayName: 'LeaveNMUser' })
      const nmToken = jwtService.sign({ sub: nonMember.id, email: nonMember.email })
      const club = await createClub({ ownerId: owner.id, name: 'Leave NM Club' })
      await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/api/clubs/${club.id}/leave`)
        .set('Authorization', `Bearer ${nmToken}`)
        .expect(404)
    })

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/api/clubs/00000000-0000-0000-0000-000000000000/leave')
        .expect(401)
    })
  })
})
