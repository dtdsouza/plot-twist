import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { ClubInviteService } from '../club-invite.service'
import { ClubInviteRepository } from '../../persistence/repository/club-invite.repository'
import { ClubRepository } from '../../persistence/repository/club.repository'
import { MembershipRepository } from '../../persistence/repository/membership.repository'
import { EmailClient } from '@module/shared/mail'
import { CLUBS_CONFIG_KEY } from '@module/shared/config'
import { EMembershipRole } from '../../persistence/enum/membership-role.enum'
import type { ClubInviteEntity } from '../../persistence/entity/club-invite.entity'
import type { ClubEntity } from '../../persistence/entity/club.entity'

const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const MEMBER_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_ID = '33333333-3333-3333-3333-333333333333'
const CLUB_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const INVITE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const INVITE_TOKEN = 'fake-token-abc123'
const INVITE_URL_BASE = 'http://localhost:4200/clubs/join'

function makeClub(overrides?: Partial<ClubEntity>): ClubEntity {
  return {
    id: CLUB_ID,
    name: 'Book Worms',
    description: 'A reading group',
    ownerId: OWNER_ID,
    coverImageUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as ClubEntity
}

function makeInvite(overrides?: Partial<ClubInviteEntity>): ClubInviteEntity {
  return {
    id: INVITE_ID,
    clubId: CLUB_ID,
    token: INVITE_TOKEN,
    createdByUserId: OWNER_ID,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as ClubInviteEntity
}

describe('ClubInviteService', () => {
  let service: ClubInviteService
  let mockClubInviteRepository: {
    findActiveByClub: jest.Mock
    findActiveByToken: jest.Mock
    revokeActiveForClub: jest.Mock
    insert: jest.Mock
    update: jest.Mock
  }
  let mockClubRepository: { findOne: jest.Mock }
  let mockMembershipRepository: {
    findRoleForUser: jest.Mock
    createMemberMembership: jest.Mock
    countByClub: jest.Mock
  }
  let mockEmailClient: { send: jest.Mock }
  let mockConfigService: { getOrThrow: jest.Mock }
  let mockDataSource: { transaction: jest.Mock }

  beforeEach(async () => {
    mockClubInviteRepository = {
      findActiveByClub: jest.fn(),
      findActiveByToken: jest.fn(),
      revokeActiveForClub: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    }

    mockClubRepository = {
      findOne: jest.fn(),
    }

    mockMembershipRepository = {
      findRoleForUser: jest.fn(),
      createMemberMembership: jest.fn(),
      countByClub: jest.fn(),
    }

    mockEmailClient = {
      send: jest.fn(),
    }

    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue({
        inviteUrl: INVITE_URL_BASE,
        inviteExpiryDays: 14,
      }),
    }

    mockDataSource = {
      transaction: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubInviteService,
        { provide: ClubInviteRepository, useValue: mockClubInviteRepository },
        { provide: ClubRepository, useValue: mockClubRepository },
        { provide: MembershipRepository, useValue: mockMembershipRepository },
        { provide: EmailClient, useValue: mockEmailClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile()

    service = module.get<ClubInviteService>(ClubInviteService)
    jest.clearAllMocks()

    // Re-apply config mock since clearAllMocks wipes mock return values,
    // but the constructor already consumed the config at build time — the service
    // stores values in private fields, so this only matters if configService is
    // called again during tests (it is not).
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('getOrCreateActive', () => {
    it('returns existing active invite as { token, url, expiresAt }', async () => {
      // Arrange
      const invite = makeInvite()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)

      // Act
      const result = await service.getOrCreateActive(CLUB_ID, OWNER_ID)

      // Assert
      expect(result.token).toBe(INVITE_TOKEN)
      expect(result.url).toBe(`${INVITE_URL_BASE}/${INVITE_TOKEN}`)
      expect(result.expiresAt).toBe(invite.expiresAt)
      expect(mockClubInviteRepository.insert).not.toHaveBeenCalled()
    })

    it('creates a new invite when none is active and returns it', async () => {
      // Arrange
      const freshInvite = makeInvite({ token: 'new-token-xyz' })
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(null)
      mockClubInviteRepository.insert.mockResolvedValue(freshInvite)

      // Act
      const result = await service.getOrCreateActive(CLUB_ID, OWNER_ID)

      // Assert
      expect(mockClubInviteRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          clubId: CLUB_ID,
          createdByUserId: OWNER_ID,
          revokedAt: null,
        }),
      )
      expect(result.token).toBe('new-token-xyz')
      expect(result.url).toBe(`${INVITE_URL_BASE}/new-token-xyz`)
    })

    it('builds the url from the config inviteUrl', async () => {
      // Arrange
      const invite = makeInvite({ token: 'config-check-token' })
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)

      // Act
      const result = await service.getOrCreateActive(CLUB_ID, OWNER_ID)

      // Assert: url is constructed as {inviteUrl}/{token}
      expect(result.url).toBe(`${INVITE_URL_BASE}/config-check-token`)
    })

    it('throws NotFoundException when caller is not a member (role null)', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)

      // Act & Assert
      await expect(service.getOrCreateActive(CLUB_ID, OTHER_ID)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockClubInviteRepository.findActiveByClub).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException when caller is a member but not owner', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)

      // Act & Assert
      await expect(service.getOrCreateActive(CLUB_ID, MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockClubInviteRepository.findActiveByClub).not.toHaveBeenCalled()
    })
  })

  describe('rotate', () => {
    it('revokes active invite and inserts a new one in a transaction', async () => {
      // Arrange
      const newInvite = makeInvite({ token: 'rotated-token' })
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)

      const mockManager = {}
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: typeof mockManager) => Promise<ClubInviteEntity>) => {
          mockClubInviteRepository.revokeActiveForClub.mockResolvedValue(undefined)
          mockClubInviteRepository.insert.mockResolvedValue(newInvite)
          return cb(mockManager)
        },
      )

      // Act
      const result = await service.rotate(CLUB_ID, OWNER_ID)

      // Assert
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1)
      expect(mockClubInviteRepository.revokeActiveForClub).toHaveBeenCalledWith(
        mockManager,
        CLUB_ID,
      )
      expect(mockClubInviteRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          clubId: CLUB_ID,
          createdByUserId: OWNER_ID,
          revokedAt: null,
        }),
      )
      expect(result.token).toBe('rotated-token')
      expect(result.url).toBe(`${INVITE_URL_BASE}/rotated-token`)
    })

    it('throws ForbiddenException for non-owner', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)

      // Act & Assert
      await expect(service.rotate(CLUB_ID, MEMBER_ID)).rejects.toThrow(ForbiddenException)
      expect(mockDataSource.transaction).not.toHaveBeenCalled()
    })
  })

  describe('revoke', () => {
    it('updates revokedAt when there is an active invite', async () => {
      // Arrange
      const invite = makeInvite()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)
      mockClubInviteRepository.update.mockResolvedValue(invite)

      // Act
      await service.revoke(CLUB_ID, OWNER_ID)

      // Assert
      expect(mockClubInviteRepository.update).toHaveBeenCalledWith(
        INVITE_ID,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      )
    })

    it('is a no-op when no active invite exists', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(null)

      // Act
      await service.revoke(CLUB_ID, OWNER_ID)

      // Assert
      expect(mockClubInviteRepository.update).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException for non-owner', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)

      // Act & Assert
      await expect(service.revoke(CLUB_ID, MEMBER_ID)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('preview', () => {
    it('returns club preview shape including memberCount for a valid token', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub({ coverImageUrl: 'https://example.com/cover.jpg' })
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockClubRepository.findOne.mockResolvedValue(club)
      mockMembershipRepository.countByClub.mockResolvedValue(5)

      // Act
      const result = await service.preview(INVITE_TOKEN)

      // Assert
      expect(result).toEqual({
        clubId: CLUB_ID,
        name: 'Book Worms',
        coverImageUrl: 'https://example.com/cover.jpg',
        memberCount: 5,
      })
      expect(mockMembershipRepository.countByClub).toHaveBeenCalledWith(CLUB_ID)
    })

    it('throws 410 Gone when token is not found or expired', async () => {
      // Arrange
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(null)

      // Act & Assert
      await expect(service.preview(INVITE_TOKEN)).rejects.toMatchObject({
        status: HttpStatus.GONE,
      })
      expect(mockClubRepository.findOne).not.toHaveBeenCalled()
    })

    it('throws 410 Gone when club is missing (orphaned invite)', async () => {
      // Arrange
      const invite = makeInvite()
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.preview(INVITE_TOKEN)).rejects.toMatchObject({
        status: HttpStatus.GONE,
      })
    })

    it('throws HttpException with status 410 (not 404)', async () => {
      // Arrange
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(null)

      // Act & Assert
      let thrown: unknown
      try {
        await service.preview(INVITE_TOKEN)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(HttpException)
      expect((thrown as HttpException).getStatus()).toBe(HttpStatus.GONE)
    })
  })

  describe('redeem', () => {
    it('creates membership for a new user and returns the club', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub()
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)
      mockMembershipRepository.createMemberMembership.mockResolvedValue(undefined)
      mockClubRepository.findOne.mockResolvedValue(club)

      // Act
      const result = await service.redeem(INVITE_TOKEN, OTHER_ID)

      // Assert
      expect(mockMembershipRepository.createMemberMembership).toHaveBeenCalledWith(
        CLUB_ID,
        OTHER_ID,
      )
      expect(result.id).toBe(CLUB_ID)
    })

    it('is idempotent: does NOT insert when user is already a member', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub()
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)
      mockClubRepository.findOne.mockResolvedValue(club)

      // Act
      const result = await service.redeem(INVITE_TOKEN, MEMBER_ID)

      // Assert
      expect(mockMembershipRepository.createMemberMembership).not.toHaveBeenCalled()
      expect(result.id).toBe(CLUB_ID)
    })

    it('swallows 23505 unique-violation as an idempotent success', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub()
      const uniqueViolationError = Object.assign(new Error('unique violation'), { code: '23505' })
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)
      mockMembershipRepository.createMemberMembership.mockRejectedValue(uniqueViolationError)
      mockClubRepository.findOne.mockResolvedValue(club)

      // Act — should NOT throw
      const result = await service.redeem(INVITE_TOKEN, OTHER_ID)

      // Assert
      expect(result.id).toBe(CLUB_ID)
    })

    it('re-throws non-unique-violation errors', async () => {
      // Arrange
      const invite = makeInvite()
      const unexpectedError = new Error('unexpected DB error')
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)
      mockMembershipRepository.createMemberMembership.mockRejectedValue(unexpectedError)

      // Act & Assert
      await expect(service.redeem(INVITE_TOKEN, OTHER_ID)).rejects.toThrow('unexpected DB error')
    })

    it('throws 410 Gone when token is invalid or expired', async () => {
      // Arrange
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(null)

      // Act & Assert
      await expect(service.redeem(INVITE_TOKEN, OTHER_ID)).rejects.toMatchObject({
        status: HttpStatus.GONE,
      })
    })

    it('throws 410 Gone when club is missing after membership creation', async () => {
      // Arrange
      const invite = makeInvite()
      mockClubInviteRepository.findActiveByToken.mockResolvedValue(invite)
      mockMembershipRepository.findRoleForUser.mockResolvedValue(null)
      mockMembershipRepository.createMemberMembership.mockResolvedValue(undefined)
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.redeem(INVITE_TOKEN, OTHER_ID)).rejects.toMatchObject({
        status: HttpStatus.GONE,
      })
    })
  })

  describe('email', () => {
    it('sends an email to each address in the list', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)
      mockClubRepository.findOne.mockResolvedValue(club)
      mockEmailClient.send.mockResolvedValue(undefined)

      const emails = ['alice@example.com', 'bob@example.com', 'carol@example.com']

      // Act
      await service.email(CLUB_ID, OWNER_ID, emails)

      // Assert
      expect(mockEmailClient.send).toHaveBeenCalledTimes(3)
      const sentToAddresses = mockEmailClient.send.mock.calls.map((c) => c[0].to)
      expect(sentToAddresses).toContain('alice@example.com')
      expect(sentToAddresses).toContain('bob@example.com')
      expect(sentToAddresses).toContain('carol@example.com')
    })

    it('does NOT throw when one send fails; other sends still proceed', async () => {
      // Arrange
      const invite = makeInvite()
      const club = makeClub()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)
      mockClubRepository.findOne.mockResolvedValue(club)
      mockEmailClient.send
        .mockRejectedValueOnce(new Error('SMTP failure'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)

      const emails = ['fail@example.com', 'ok1@example.com', 'ok2@example.com']

      // Act — must not throw
      await expect(service.email(CLUB_ID, OWNER_ID, emails)).resolves.toBeUndefined()

      // Assert: all three sends were attempted despite the first failure
      expect(mockEmailClient.send).toHaveBeenCalledTimes(3)
    })

    it('throws NotFoundException when club is missing', async () => {
      // Arrange
      const invite = makeInvite()
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.OWNER)
      mockClubInviteRepository.findActiveByClub.mockResolvedValue(invite)
      mockClubInviteRepository.insert.mockResolvedValue(invite)
      mockClubRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.email(CLUB_ID, OWNER_ID, ['someone@example.com']),
      ).rejects.toThrow(NotFoundException)
      expect(mockEmailClient.send).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException for non-owner', async () => {
      // Arrange
      mockMembershipRepository.findRoleForUser.mockResolvedValue(EMembershipRole.MEMBER)

      // Act & Assert
      await expect(
        service.email(CLUB_ID, MEMBER_ID, ['someone@example.com']),
      ).rejects.toThrow(ForbiddenException)
    })
  })
})
