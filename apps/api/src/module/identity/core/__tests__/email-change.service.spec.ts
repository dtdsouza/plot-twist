import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { EmailChangeService } from '../email-change.service'
import { UserEntity } from '../../persistence/entity/user.entity'
import { EmailChangeTokenEntity } from '../../persistence/entity/email-change-token.entity'
import { UserRepository } from '../../persistence/repository/user.repository'
import { EmailChangeTokenRepository } from '../../persistence/repository/email-change-token.repository'
import { EUserStatus } from '../../persistence/enum/user-status.enum'
import { EmailClient } from '@module/shared/mail'

jest.mock('bcryptjs')
jest.mock('node:crypto', () => {
  const actual = jest.requireActual('node:crypto')
  return {
    ...actual,
    randomBytes: jest.fn(),
    createHash: jest.fn(),
  }
})

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>
const mockCrypto = crypto as jest.Mocked<typeof crypto>

describe('EmailChangeService', () => {
  let service: EmailChangeService
  let mockUserRepository: {
    findOne: jest.Mock
    findMany: jest.Mock
    create: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let mockTokenRepository: {
    findValidByTokenHash: jest.Mock
    create: jest.Mock
    deleteAllForUser: jest.Mock
  }
  let mockEmailClient: {
    send: jest.Mock
  }
  let mockDataSource: {
    transaction: jest.Mock
  }

  const mockUser: UserEntity = {
    id: 'user-uuid-123',
    email: 'old@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    avatar: null,
    bio: null,
    status: EUserStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  const mockHashUpdate = jest.fn()
  const mockHashDigest = jest.fn()

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    mockTokenRepository = {
      findValidByTokenHash: jest.fn(),
      create: jest.fn(),
      deleteAllForUser: jest.fn(),
    }

    mockEmailClient = {
      send: jest.fn().mockResolvedValue(undefined),
    }

    mockDataSource = {
      transaction: jest.fn(),
    }

    const mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue({
        emailChangeVerificationUrl: 'http://localhost:4200/verify-email-change',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChangeService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: EmailChangeTokenRepository, useValue: mockTokenRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EmailClient, useValue: mockEmailClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<EmailChangeService>(EmailChangeService)

    jest.clearAllMocks()

    // Re-prime mailer mock after clearAllMocks
    mockEmailClient.send.mockResolvedValue(undefined)

    mockHashDigest.mockReturnValue('hashed-token-hex')
    mockHashUpdate.mockReturnValue({ digest: mockHashDigest })
    mockCrypto.createHash.mockReturnValue({ update: mockHashUpdate } as never)
    mockCrypto.randomBytes.mockReturnValue(
      Buffer.from('a'.repeat(32)) as never,
    )
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('initiate', () => {
    const dto = {
      currentPassword: 'pw123',
      newEmail: 'new@example.com',
    }

    it('creates a token and emails the new address on the happy path', async () => {
      // Arrange
      mockUserRepository.findOne
        .mockResolvedValueOnce(mockUser) // user lookup by id
        .mockResolvedValueOnce(null) // duplicate-email lookup
      mockBcrypt.compare.mockResolvedValue(true as never)
      mockTokenRepository.create.mockResolvedValue({} as never)

      // Act
      const result = await service.initiate(mockUser.id, dto as never)

      // Assert
      expect(result).toEqual({ message: 'Check your new inbox' })
      expect(mockBcrypt.compare).toHaveBeenCalledWith(
        'pw123',
        mockUser.passwordHash,
      )
      expect(mockTokenRepository.deleteAllForUser).toHaveBeenCalledWith(mockUser.id)
      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          tokenHash: 'hashed-token-hex',
          newEmail: 'new@example.com',
        }),
      )
      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          subject: 'Verify your new Plot-Twist email',
          html: expect.stringContaining(
            'http://localhost:4200/verify-email-change?token=',
          ),
        }),
      )
    })

    it('wipes existing pending tokens before issuing a new one (re-initiate)', async () => {
      // Arrange
      mockUserRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null)
      mockBcrypt.compare.mockResolvedValue(true as never)
      const callOrder: string[] = []
      mockTokenRepository.deleteAllForUser.mockImplementation(() => {
        callOrder.push('deleteAllForUser')
        return Promise.resolve()
      })
      mockTokenRepository.create.mockImplementation(() => {
        callOrder.push('create')
        return Promise.resolve({})
      })

      // Act
      await service.initiate(mockUser.id, dto as never)

      // Assert
      expect(callOrder).toEqual(['deleteAllForUser', 'create'])
    })

    it('throws NotFoundException when user does not exist', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValueOnce(null)

      // Act & Assert
      await expect(service.initiate('missing', dto as never)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
    })

    it('throws UnauthorizedException when the current password is wrong', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValueOnce(mockUser)
      mockBcrypt.compare.mockResolvedValue(false as never)

      // Act & Assert
      await expect(
        service.initiate(mockUser.id, dto as never),
      ).rejects.toThrow(UnauthorizedException)
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when new email matches current email', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValueOnce(mockUser)
      mockBcrypt.compare.mockResolvedValue(true as never)

      // Act & Assert
      await expect(
        service.initiate(mockUser.id, {
          currentPassword: 'pw123',
          newEmail: mockUser.email,
        } as never),
      ).rejects.toThrow(BadRequestException)
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
    })

    it('throws ConflictException (409) when the new email is already taken', async () => {
      // Arrange
      mockUserRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ ...mockUser, id: 'other-user' })
      mockBcrypt.compare.mockResolvedValue(true as never)

      // Act & Assert
      await expect(
        service.initiate(mockUser.id, dto as never),
      ).rejects.toThrow(ConflictException)
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
    })

    it('does not throw if email sending fails (token is still persisted)', async () => {
      // Arrange
      mockUserRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null)
      mockBcrypt.compare.mockResolvedValue(true as never)
      mockTokenRepository.create.mockResolvedValue({} as never)
      mockEmailClient.send.mockRejectedValue(new Error('Mailer down'))

      // Act & Assert
      await expect(
        service.initiate(mockUser.id, dto as never),
      ).resolves.toEqual({ message: 'Check your new inbox' })
      expect(mockTokenRepository.create).toHaveBeenCalled()
    })
  })

  describe('verify', () => {
    const mockTokenEntity: EmailChangeTokenEntity = {
      id: 'token-uuid-1',
      userId: mockUser.id,
      tokenHash: 'hashed-token-hex',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    }

    it('updates the user email and deletes the token in a transaction', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(mockTokenEntity)
      mockDataSource.transaction.mockImplementation(async (cb: Function) => {
        const mockManager = {
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        }
        await cb(mockManager)
        expect(mockManager.update).toHaveBeenCalledWith(
          UserEntity,
          { id: mockUser.id },
          { email: 'new@example.com' },
        )
        expect(mockManager.delete).toHaveBeenCalledWith(
          EmailChangeTokenEntity,
          { id: mockTokenEntity.id },
        )
      })

      // Act
      const result = await service.verify('raw-token')

      // Assert
      expect(result).toEqual({
        message: 'Email updated',
        email: 'new@example.com',
      })
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('throws 410 HttpException for unknown/used token', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(null)

      // Act & Assert
      try {
        await service.verify('missing-token')
        fail('expected throw')
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException)
        expect((error as HttpException).getStatus()).toBe(410)
        expect((error as HttpException).message).toBe('Link expired or invalid')
      }
      expect(mockDataSource.transaction).not.toHaveBeenCalled()
    })

    it('throws 410 HttpException for expired token (defensive double-check)', async () => {
      // Arrange — repository would normally filter expired rows, but service double-checks
      const expired: EmailChangeTokenEntity = {
        ...mockTokenEntity,
        expiresAt: new Date(Date.now() - 1000),
      }
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(expired)

      // Act & Assert
      try {
        await service.verify('expired-token')
        fail('expected throw')
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException)
        expect((error as HttpException).getStatus()).toBe(410)
      }
      expect(mockDataSource.transaction).not.toHaveBeenCalled()
    })

    it('hashes the incoming token with SHA-256 before lookup', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(null)

      // Act
      try {
        await service.verify('raw-token')
      } catch {
        // expected throw
      }

      // Assert
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
      expect(mockHashUpdate).toHaveBeenCalledWith('raw-token')
    })
  })
})
