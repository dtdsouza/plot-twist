import { Test, TestingModule } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AuthService } from '../auth.service'
import { UserEntity } from '../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../persistence/entity/password-reset-token.entity'
import { UserRepository } from '../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../persistence/repository/password-reset-token.repository'
import { EUserStatus } from '../../persistence/enum/user-status.enum'
import { EMAIL_SERVICE } from '../../../../infra/mail/interface/email-service.interface'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'

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

describe('AuthService', () => {
  let service: AuthService
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
  let mockJwtService: {
    sign: jest.Mock
  }
  let mockEmailService: {
    send: jest.Mock
  }
  let mockDataSource: {
    transaction: jest.Mock
  }

  const mockUser: UserEntity = {
    id: 'uuid-123',
    email: 'test@example.com',
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

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    }

    mockEmailService = {
      send: jest.fn().mockResolvedValue(undefined),
    }

    mockDataSource = {
      transaction: jest.fn(),
    }

    const mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue({
        passwordResetUrl: 'http://localhost:4200/reset-password',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: PasswordResetTokenRepository, useValue: mockTokenRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EMAIL_SERVICE, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)

    jest.clearAllMocks()
    mockJwtService.sign.mockReturnValue('mock-jwt-token')
    mockEmailService.send.mockResolvedValue(undefined)

    // Setup crypto mocks
    mockHashDigest.mockReturnValue('hashed-token-hex')
    mockHashUpdate.mockReturnValue({ digest: mockHashDigest })
    mockCrypto.createHash.mockReturnValue({ update: mockHashUpdate } as never)
    mockCrypto.randomBytes.mockReturnValue(Buffer.from('a'.repeat(32)) as never)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    }

    it('should create a user and return an auth response', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)
      mockBcrypt.hash.mockResolvedValue('hashed-password' as never)
      mockUserRepository.create.mockResolvedValue(mockUser)

      // Act
      const result = await service.register(registerDto)

      // Assert
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          avatar: mockUser.avatar,
          bio: mockUser.bio,
          createdAt: mockUser.createdAt,
        },
      })
    })

    it('should hash the password with 12 salt rounds before saving', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)
      mockBcrypt.hash.mockResolvedValue('hashed-password' as never)
      mockUserRepository.create.mockResolvedValue(mockUser)

      // Act
      await service.register(registerDto)

      // Assert
      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12)
    })

    it('should throw ConflictException when email already exists', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      )
    })

    it('should not include passwordHash in the returned user object', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)
      mockBcrypt.hash.mockResolvedValue('hashed-password' as never)
      mockUserRepository.create.mockResolvedValue(mockUser)

      // Act
      const result = await service.register(registerDto)

      // Assert
      expect(result.user).not.toHaveProperty('passwordHash')
    })

    it('should sign JWT with sub and email payload', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)
      mockBcrypt.hash.mockResolvedValue('hashed-password' as never)
      mockUserRepository.create.mockResolvedValue(mockUser)

      // Act
      await service.register(registerDto)

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
      })
    })
  })

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    }

    it('should return auth response when credentials are valid', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(true as never)

      // Act
      const result = await service.login(loginDto)

      // Assert
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          avatar: mockUser.avatar,
          bio: mockUser.bio,
          createdAt: mockUser.createdAt,
        },
      })
    })

    it('should throw UnauthorizedException when email is not found', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('should throw UnauthorizedException when password is wrong', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(false as never)

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('should not include passwordHash in the returned user object', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(true as never)

      // Act
      const result = await service.login(loginDto)

      // Assert
      expect(result.user).not.toHaveProperty('passwordHash')
    })

    it('should use same error message for missing email and wrong password to prevent enumeration', async () => {
      // Arrange - missing email case
      mockUserRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      )

      // Arrange - wrong password case
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(false as never)

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      )
    })

    it('should sign JWT with sub and email payload', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(true as never)

      // Act
      await service.login(loginDto)

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
      })
    })
  })

  describe('forgotPassword', () => {
    it('should generate token, store hash, and send email for active user', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockTokenRepository.create.mockResolvedValue({
        tokenHash: 'hashed-token-hex',
        userId: mockUser.id,
        expiresAt: expect.any(Date),
      })

      // Act
      await service.forgotPassword(mockUser.email)

      // Assert
      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32)
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
      expect(mockTokenRepository.deleteAllForUser).toHaveBeenCalledWith(mockUser.id)
      expect(mockTokenRepository.create).toHaveBeenCalled()
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          subject: 'Reset your Plot-Twist password',
        }),
      )
    })

    it('should not throw for non-existent email (prevents enumeration)', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null)

      // Act & Assert
      await expect(service.forgotPassword('unknown@example.com')).resolves.toBeUndefined()
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
      expect(mockEmailService.send).not.toHaveBeenCalled()
    })

    it('should not generate token for INACTIVE user', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, status: EUserStatus.INACTIVE }
      mockUserRepository.findOne.mockResolvedValue(inactiveUser)

      // Act
      await service.forgotPassword(inactiveUser.email)

      // Assert
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
      expect(mockEmailService.send).not.toHaveBeenCalled()
    })

    it('should not generate token for SUSPENDED user', async () => {
      // Arrange
      const suspendedUser = { ...mockUser, status: EUserStatus.SUSPENDED }
      mockUserRepository.findOne.mockResolvedValue(suspendedUser)

      // Act
      await service.forgotPassword(suspendedUser.email)

      // Assert
      expect(mockTokenRepository.create).not.toHaveBeenCalled()
      expect(mockEmailService.send).not.toHaveBeenCalled()
    })

    it('should invalidate previous tokens before creating new one', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
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
      await service.forgotPassword(mockUser.email)

      // Assert
      expect(callOrder).toEqual(['deleteAllForUser', 'create'])
    })

    it('should store hashed token, not raw token', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockTokenRepository.create.mockResolvedValue({})

      // Act
      await service.forgotPassword(mockUser.email)

      // Assert
      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'hashed-token-hex',
        }),
      )
    })

    it('should log and continue if email sending fails', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockTokenRepository.create.mockResolvedValue({})
      mockEmailService.send.mockRejectedValue(new Error('Email send failed'))

      // Act & Assert -- should not throw
      await expect(service.forgotPassword(mockUser.email)).resolves.toBeUndefined()
      expect(mockTokenRepository.create).toHaveBeenCalled()
    })

    it('should include reset URL with raw token in email', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockTokenRepository.create.mockResolvedValue({})
      mockCrypto.randomBytes.mockReturnValue(Buffer.from('abcdef1234567890abcdef1234567890') as never)

      // Act
      await service.forgotPassword(mockUser.email)

      // Assert
      const sentEmail = mockEmailService.send.mock.calls[0][0]
      expect(sentEmail.html).toContain('http://localhost:4200/reset-password?token=')
      expect(sentEmail.text).toContain('http://localhost:4200/reset-password?token=')
    })
  })

  describe('resetPassword', () => {
    const mockTokenEntity: PasswordResetTokenEntity = {
      id: 'token-uuid-1',
      tokenHash: 'hashed-token-hex',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    }

    it('should update password and delete token for valid token', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(mockTokenEntity)
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never)
      mockDataSource.transaction.mockImplementation(async (cb: Function) => {
        const mockManager = {
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        }
        await cb(mockManager)
        expect(mockManager.update).toHaveBeenCalledWith(
          UserEntity,
          { id: mockUser.id },
          { passwordHash: 'new-hashed-password' },
        )
        expect(mockManager.delete).toHaveBeenCalledWith(
          PasswordResetTokenEntity,
          { id: mockTokenEntity.id },
        )
      })

      // Act
      await service.resetPassword('raw-token', 'newPassword123')

      // Assert
      expect(mockDataSource.transaction).toHaveBeenCalled()
      expect(mockBcrypt.hash).toHaveBeenCalledWith('newPassword123', 12)
    })

    it('should throw BadRequestException for expired token', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.resetPassword('expired-token', 'newPassword123'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException for non-existent token', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.resetPassword('invalid-token', 'newPassword123'),
      ).rejects.toThrow('Invalid or expired reset token')
    })

    it('should throw BadRequestException for INACTIVE user with valid token', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, status: EUserStatus.INACTIVE }
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(mockTokenEntity)
      mockUserRepository.findOne.mockResolvedValue(inactiveUser)

      // Act & Assert
      await expect(
        service.resetPassword('raw-token', 'newPassword123'),
      ).rejects.toThrow('Invalid or expired reset token')
    })

    it('should throw BadRequestException for SUSPENDED user with valid token', async () => {
      // Arrange
      const suspendedUser = { ...mockUser, status: EUserStatus.SUSPENDED }
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(mockTokenEntity)
      mockUserRepository.findOne.mockResolvedValue(suspendedUser)

      // Act & Assert
      await expect(
        service.resetPassword('raw-token', 'newPassword123'),
      ).rejects.toThrow('Invalid or expired reset token')
    })

    it('should hash the incoming token with SHA-256 before lookup', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(null)

      // Act
      try {
        await service.resetPassword('raw-token', 'newPassword123')
      } catch {
        // expected to throw
      }

      // Assert
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
      expect(mockHashUpdate).toHaveBeenCalledWith('raw-token')
    })

    it('should wrap password update and token deletion in a transaction', async () => {
      // Arrange
      mockTokenRepository.findValidByTokenHash.mockResolvedValue(mockTokenEntity)
      mockUserRepository.findOne.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never)
      mockDataSource.transaction.mockImplementation(async (cb: Function) => {
        await cb({
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        })
      })

      // Act
      await service.resetPassword('raw-token', 'newPassword123')

      // Assert
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1)
    })
  })
})
