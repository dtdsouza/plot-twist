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
import { Client } from 'pg'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { AuthService } from '../auth.service'
import { UserEntity } from '../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../persistence/entity/password-reset-token.entity'
import { EMAIL_SERVICE } from '../../../../infra/mail/interface/email-service.interface'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('AuthService (integration)', () => {
  let service: AuthService
  let dataSource: DataSource
  let module: TestingModule
  let mockEmailService: { send: jest.Mock }

  beforeAll(async () => {
    // Create the identity schema before TypeORM synchronize runs
    const pgClient = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USERNAME,
      password: DB_PASSWORD,
      database: DB_NAME,
    })
    await pgClient.connect()
    await pgClient.query('CREATE SCHEMA IF NOT EXISTS identity')
    await pgClient.end()

    mockEmailService = { send: jest.fn().mockResolvedValue(undefined) }

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
        { provide: EMAIL_SERVICE, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    mockEmailService.send.mockClear()
    await dataSource.query(
      `DELETE FROM identity."password_reset_token" WHERE "userId" IN (SELECT id FROM identity."user" WHERE email LIKE $1)`,
      ['%@int.test'],
    )
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, [
      '%@int.test',
    ])
  })

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM identity."password_reset_token" WHERE "userId" IN (SELECT id FROM identity."user" WHERE email LIKE $1)`,
      ['%@int.test'],
    )
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, [
      '%@int.test',
    ])
    await module?.close()
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
      // Arrange
      const dto = {
        email: 'duplicate@int.test',
        password: 'password123',
        displayName: 'Duplicate User',
      }
      await service.register(dto)

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
      const registerDto = {
        email: 'login@int.test',
        password: 'password123',
        displayName: 'Login User',
      }
      await service.register(registerDto)

      // Act
      const result = await service.login({
        email: registerDto.email,
        password: registerDto.password,
      })

      // Assert
      expect(result.accessToken).toBeDefined()
      expect(result.user.email).toBe(registerDto.email)
    })

    it('should throw UnauthorizedException for wrong password', async () => {
      // Arrange
      const registerDto = {
        email: 'wrongpass@int.test',
        password: 'correct-password',
        displayName: 'Wrong Pass User',
      }
      await service.register(registerDto)

      // Act & Assert
      await expect(
        service.login({
          email: registerDto.email,
          password: 'wrong-password',
        }),
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
      const dto = {
        email: 'forgot@int.test',
        password: 'password123',
        displayName: 'Forgot User',
      }
      await service.register(dto)

      // Act
      await service.forgotPassword(dto.email)

      // Assert
      const tokens = await dataSource.query(
        `SELECT * FROM identity."password_reset_token" WHERE "userId" = (SELECT id FROM identity."user" WHERE email = $1)`,
        [dto.email],
      )
      expect(tokens).toHaveLength(1)
      expect(tokens[0].tokenHash).toBeDefined()
      expect(tokens[0].tokenHash.length).toBe(64) // SHA-256 hex
    })

    it('should send an email when requesting password reset', async () => {
      // Arrange
      const dto = {
        email: 'emailsent@int.test',
        password: 'password123',
        displayName: 'Email User',
      }
      await service.register(dto)

      // Act
      await service.forgotPassword(dto.email)

      // Assert
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: dto.email,
          subject: 'Reset your Plot-Twist password',
        }),
      )
    })

    it('should invalidate previous tokens when requesting a new reset', async () => {
      // Arrange
      const dto = {
        email: 'invalidate@int.test',
        password: 'password123',
        displayName: 'Invalidate User',
      }
      await service.register(dto)

      // Act
      await service.forgotPassword(dto.email)
      await service.forgotPassword(dto.email)

      // Assert — only the latest token should remain
      const tokens = await dataSource.query(
        `SELECT * FROM identity."password_reset_token" WHERE "userId" = (SELECT id FROM identity."user" WHERE email = $1)`,
        [dto.email],
      )
      expect(tokens).toHaveLength(1)
    })
  })

  describe('resetPassword', () => {
    it('should complete full forgot-password -> reset-password flow', async () => {
      // Arrange
      const dto = {
        email: 'fullflow@int.test',
        password: 'oldPassword123',
        displayName: 'Full Flow User',
      }
      await service.register(dto)

      // Create a token manually to get the raw value
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')

      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          [dto.email],
        )
      )[0].id

      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() + 3600000)],
      )

      // Act
      await service.resetPassword(rawToken, 'newPassword456')

      // Assert — can login with new password
      const result = await service.login({
        email: dto.email,
        password: 'newPassword456',
      })
      expect(result.accessToken).toBeDefined()
    })

    it('should delete token from DB after successful reset', async () => {
      // Arrange
      const dto = {
        email: 'deltoken@int.test',
        password: 'password123',
        displayName: 'Del Token User',
      }
      await service.register(dto)

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')

      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          [dto.email],
        )
      )[0].id

      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() + 3600000)],
      )

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
      const dto = {
        email: 'expired@int.test',
        password: 'password123',
        displayName: 'Expired User',
      }
      await service.register(dto)

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')

      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          [dto.email],
        )
      )[0].id

      // Insert token that expired 1 hour ago
      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() - 3600000)],
      )

      // Act & Assert
      await expect(
        service.resetPassword(rawToken, 'newPassword456'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject already-used token', async () => {
      // Arrange
      const dto = {
        email: 'usedtoken@int.test',
        password: 'password123',
        displayName: 'Used Token User',
      }
      await service.register(dto)

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')

      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          [dto.email],
        )
      )[0].id

      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() + 3600000)],
      )

      // Use the token once
      await service.resetPassword(rawToken, 'newPassword456')

      // Act & Assert — second use should fail
      await expect(
        service.resetPassword(rawToken, 'anotherPassword789'),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
