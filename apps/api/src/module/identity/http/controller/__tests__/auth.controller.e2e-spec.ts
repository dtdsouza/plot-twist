import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as request from 'supertest'
import * as crypto from 'node:crypto'
import { AuthController } from '../auth.controller'
import { AuthService } from '../../../core/auth.service'
import { EmailChangeService } from '../../../core/email-change.service'
import { UserEntity } from '../../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../../persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from '../../../persistence/entity/email-change-token.entity'
import { UserRepository } from '../../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../../persistence/repository/password-reset-token.repository'
import { EmailChangeTokenRepository } from '../../../persistence/repository/email-change-token.repository'
import { EUserStatus } from '../../../persistence/enum/user-status.enum'
import { EmailClient } from '@module/shared/mail'
import { closeTestPool } from '@module/shared/test-support'
import {
  createPasswordResetToken,
  createUser,
  ensureIdentitySchema,
  truncateIdentity,
} from '@module/identity/test-support'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('AuthController (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let mockEmailClient: {
    send: jest.Mock
  }

  beforeAll(async () => {
    await ensureIdentitySchema()

    mockEmailClient = {
      send: jest.fn().mockResolvedValue(undefined),
    }

    const mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue({
        passwordResetUrl: 'http://localhost:4200/reset-password',
        emailChangeVerificationUrl: 'http://localhost:4200/verify-email-change',
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
          entities: [UserEntity, PasswordResetTokenEntity, EmailChangeTokenEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          UserEntity,
          PasswordResetTokenEntity,
          EmailChangeTokenEntity,
        ]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        EmailChangeService,
        UserRepository,
        PasswordResetTokenRepository,
        EmailChangeTokenRepository,
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
  })

  beforeEach(async () => {
    mockEmailClient.send.mockClear()
    await truncateIdentity()
  })

  afterAll(async () => {
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
  })

  describe('POST /api/auth/register', () => {
    const validPayload = {
      email: 'user@e2e.test',
      password: 'password123',
      displayName: 'Test User',
    }

    it('should return 201 and auth response with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validPayload)
        .expect(201)

      expect(response.body.accessToken).toBeDefined()
      expect(response.body.user.email).toBe(validPayload.email)
      expect(response.body.user.displayName).toBe(validPayload.displayName)
      expect(response.body.user.id).toBeDefined()
    })

    it('should not include passwordHash in response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validPayload)
        .expect(201)

      expect(response.body.user).not.toHaveProperty('passwordHash')
    })

    it('should return 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ password: 'password123', displayName: 'Test User' })
        .expect(400)
    })

    it('should return 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validPayload, email: 'not-an-email' })
        .expect(400)
    })

    it('should return 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validPayload, password: 'short' })
        .expect(400)
    })

    it('should return 400 when displayName is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: validPayload.email, password: validPayload.password })
        .expect(400)
    })

    it('should return 400 when extra fields are provided', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validPayload, extraField: 'not-allowed' })
        .expect(400)
    })

    it('should return 409 when email already exists', async () => {
      await createUser({
        email: validPayload.email,
        plainPassword: validPayload.password,
        displayName: validPayload.displayName,
      })

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validPayload)
        .expect(409)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await createUser({
        email: 'login@e2e.test',
        plainPassword: 'password123',
        displayName: 'Login User',
      })
    })

    it('should return 200 and auth response with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@e2e.test', password: 'password123' })
        .expect(200)

      expect(response.body.accessToken).toBeDefined()
      expect(response.body.user.email).toBe('login@e2e.test')
    })

    it('should not include passwordHash in response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@e2e.test', password: 'password123' })
        .expect(200)

      expect(response.body.user).not.toHaveProperty('passwordHash')
    })

    it('should return 401 when password is wrong', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@e2e.test', password: 'wrong-password' })
        .expect(401)
    })

    it('should return 401 when email does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@e2e.test', password: 'password123' })
        .expect(401)
    })

    it('should return 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: 'password123' })
        .expect(400)
    })

    it('should return 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@e2e.test' })
        .expect(400)
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    it('should return 202 with generic message for existing user', async () => {
      // Arrange
      await createUser({ email: 'forgot@e2e.test', displayName: 'Forgot User' })

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'forgot@e2e.test' })
        .expect(202)

      // Assert
      expect(response.body.message).toContain(
        'If an account with that email exists',
      )
    })

    it('should return 202 for non-existent email (prevents enumeration)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@e2e.test' })
        .expect(202)

      expect(response.body.message).toContain(
        'If an account with that email exists',
      )
    })

    it('should return 202 for INACTIVE user', async () => {
      // Arrange — seed an inactive user directly via factory
      await createUser({
        email: 'inactive@e2e.test',
        displayName: 'Inactive User',
        status: EUserStatus.INACTIVE,
      })

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'inactive@e2e.test' })
        .expect(202)

      // Assert — no email should be sent
      expect(response.body.message).toContain(
        'If an account with that email exists',
      )
      expect(mockEmailClient.send).not.toHaveBeenCalled()
    })

    it('should return 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('should return 400 when token is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: '', password: 'newPassword456' })
        .expect(400)
    })

    it('should return 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', password: 'short' })
        .expect(400)
    })

    it('should return 400 for invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token-value', password: 'newPassword456' })
        .expect(400)
    })

    it('should return 400 for expired token', async () => {
      // Arrange
      const user = await createUser({
        email: 'expired@e2e.test',
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
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'newPassword456' })
        .expect(400)
    })

    it('should return 200 for valid token and update password', async () => {
      // Arrange
      const user = await createUser({
        email: 'reset@e2e.test',
        plainPassword: 'oldPassword123',
        displayName: 'Reset User',
      })
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({ userId: user.id, tokenHash })

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'newPassword456' })
        .expect(200)

      // Assert
      expect(response.body.message).toContain('Password has been reset')

      // Verify login works with new password
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'reset@e2e.test', password: 'newPassword456' })
        .expect(200)
    })

    it('should return 400 for already-used token', async () => {
      // Arrange
      const user = await createUser({
        email: 'usedtoken@e2e.test',
        displayName: 'Used Token User',
      })
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await createPasswordResetToken({ userId: user.id, tokenHash })

      // Use it once
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'newPassword456' })
        .expect(200)

      // Second use should fail
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'anotherPassword789' })
        .expect(400)
    })
  })

})
