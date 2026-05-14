import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import * as crypto from 'node:crypto'
import { AuthService } from '../auth.service'
import { UserEntity } from '../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../persistence/entity/password-reset-token.entity'
import { UserRepository } from '../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../persistence/repository/password-reset-token.repository'
import { EmailClient } from '@module/shared/mail'
import {
  closeTestPool,
  ensureIdentitySchema,
  truncateIdentity,
} from '@module/shared/test-support'
import {
  createPasswordResetToken,
  createUser,
} from '@module/identity/test-support'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('AuthService (integration)', () => {
  let service: AuthService
  let dataSource: DataSource
  let module: TestingModule
  let mockEmailClient: { send: jest.Mock }

  beforeAll(async () => {
    await ensureIdentitySchema()

    mockEmailClient = { send: jest.fn().mockResolvedValue(undefined) }

    const mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue({
        passwordResetUrl: 'http://localhost:4200/reset-password',
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
          entities: [UserEntity, PasswordResetTokenEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserEntity, PasswordResetTokenEntity]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [
        AuthService,
        UserRepository,
        PasswordResetTokenRepository,
        { provide: EmailClient, useValue: mockEmailClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    mockEmailClient.send.mockClear()
    await truncateIdentity()
  })

  afterAll(async () => {
    await truncateIdentity()
    await module?.close()
    await closeTestPool()
  })

  describe('register', () => {
    it('should persist user to database', async () => {
      // Arrange
      const dto = {
        email: 'integration@int.test',
        password: 'password123',
        displayName: 'Integration User',
      }

      // Act
      const result = await service.register(dto)

      // Assert
      const users = await dataSource.query(
        `SELECT * FROM identity."user" WHERE email = $1`,
        [dto.email],
      )
      expect(users).toHaveLength(1)
      expect(result.user.id).toBe(users[0].id)
    })

    it('should store hashed password, not plaintext', async () => {
      // Arrange
      const dto = {
        email: 'hash@int.test',
        password: 'password123',
        displayName: 'Hash Test',
      }

      // Act
      await service.register(dto)

      // Assert
      const users = await dataSource.query(
        `SELECT * FROM identity."user" WHERE email = $1`,
        [dto.email],
      )
      expect(users[0].passwordHash).not.toBe(dto.password)
      expect(users[0].passwordHash).toMatch(/^\$2[ab]\$/)
    })

    it('should throw ConflictException for duplicate email', async () => {
      // Arrange — seed an existing user directly (bypass the SUT)
      const dto = {
        email: 'duplicate@int.test',
        password: 'password123',
        displayName: 'Duplicate User',
      }
      await createUser({
        email: dto.email,
        plainPassword: dto.password,
        displayName: dto.displayName,
      })

      // Act & Assert
      await expect(service.register(dto)).rejects.toThrow(ConflictException)
    })

    it('should return auth response with accessToken and user data', async () => {
      // Arrange
      const dto = {
        email: 'response@int.test',
        password: 'password123',
        displayName: 'Response User',
      }

      // Act
      const result = await service.register(dto)

      // Assert
      expect(result.accessToken).toBeDefined()
      expect(result.user.email).toBe(dto.email)
      expect(result.user.displayName).toBe(dto.displayName)
      expect(result.user).not.toHaveProperty('passwordHash')
    })
  })

  describe('login', () => {
    it('should succeed after register', async () => {
      // Arrange
      const email = 'login@int.test'
      const password = 'password123'
      await createUser({ email, plainPassword: password, displayName: 'Login User' })

      // Act
      const result = await service.login({ email, password })

      // Assert
      expect(result.accessToken).toBeDefined()
      expect(result.user.email).toBe(email)
    })

    it('should throw UnauthorizedException for wrong password', async () => {
      // Arrange
      const email = 'wrongpass@int.test'
      await createUser({
        email,
        plainPassword: 'correct-password',
        displayName: 'Wrong Pass User',
      })

      // Act & Assert
      await expect(
        service.login({ email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for non-existent user', async () => {
      // Act & Assert
      await expect(
        service.login({ email: 'nobody@int.test', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('should create a token in the database for an active user', async () => {
      // Arrange
      const email = 'forgot@int.test'
      await createUser({ email, displayName: 'Forgot User' })

      // Act
      await service.forgotPassword(email)

      // Assert
      const tokens = await dataSource.query(
        `SELECT * FROM identity."password_reset_token" WHERE "userId" = (SELECT id FROM identity."user" WHERE email = $1)`,
        [email],
      )
      expect(tokens).toHaveLength(1)
      expect(tokens[0].tokenHash).toBeDefined()
      expect(tokens[0].tokenHash.length).toBe(64) // SHA-256 hex
    })

    it('should send an email when requesting password reset', async () => {
      // Arrange
      const email = 'emailsent@int.test'
      await createUser({ email, displayName: 'Email User' })

      // Act
      await service.forgotPassword(email)

      // Assert
      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: 'Reset your Plot-Twist password',
        }),
      )
    })

    it('should invalidate previous tokens when requesting a new reset', async () => {
      // Arrange
      const email = 'invalidate@int.test'
      await createUser({ email, displayName: 'Invalidate User' })

      // Act
      await service.forgotPassword(email)
      await service.forgotPassword(email)

      // Assert — only the latest token should remain
      const tokens = await dataSource.query(
        `SELECT * FROM identity."password_reset_token" WHERE "userId" = (SELECT id FROM identity."user" WHERE email = $1)`,
        [email],
      )
      expect(tokens).toHaveLength(1)
    })
  })

  describe('resetPassword', () => {
    it('should complete full forgot-password -> reset-password flow', async () => {
      // Arrange
      const email = 'fullflow@int.test'
      const oldPassword = 'oldPassword123'
      const user = await createUser({
        email,
        plainPassword: oldPassword,
        displayName: 'Full Flow User',
      })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({ userId: user.id, tokenHash })

      // Act
      await service.resetPassword(rawToken, 'newPassword456')

      // Assert — can login with new password
      const result = await service.login({ email, password: 'newPassword456' })
      expect(result.accessToken).toBeDefined()
    })

    it('should delete token from DB after successful reset', async () => {
      // Arrange
      const user = await createUser({
        email: 'deltoken@int.test',
        displayName: 'Del Token User',
      })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({ userId: user.id, tokenHash })

      // Act
      await service.resetPassword(rawToken, 'newPassword456')

      // Assert — token should be gone
      const tokens = await dataSource.query(
        `SELECT * FROM identity."password_reset_token" WHERE "tokenHash" = $1`,
        [tokenHash],
      )
      expect(tokens).toHaveLength(0)
    })

    it('should reject expired token', async () => {
      // Arrange
      const user = await createUser({
        email: 'expired@int.test',
        displayName: 'Expired User',
      })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 3_600_000),
      })

      // Act & Assert
      await expect(
        service.resetPassword(rawToken, 'newPassword456'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject already-used token', async () => {
      // Arrange
      const user = await createUser({
        email: 'usedtoken@int.test',
        displayName: 'Used Token User',
      })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({ userId: user.id, tokenHash })

      // Use the token once
      await service.resetPassword(rawToken, 'newPassword456')

      // Act & Assert — second use should fail
      await expect(
        service.resetPassword(rawToken, 'anotherPassword789'),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
