import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as request from 'supertest'
import * as crypto from 'node:crypto'
import { DataSource } from 'typeorm'
import { Client } from 'pg'
import { AuthController } from '../auth.controller'
import { AuthService } from '../../../core/auth.service'
import { UserEntity } from '../../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../../persistence/entity/password-reset-token.entity'
import { UserRepository } from '../../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../../persistence/repository/password-reset-token.repository'
import { EUserStatus } from '../../../persistence/enum/user-status.enum'
import { EMAIL_SERVICE } from '../../../../shared/mail/interface/email-service.interface'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('AuthController (e2e)', () => {
  let app: INestApplication
  let dataSource: DataSource
  let module: TestingModule
  let mockEmailService: { send: jest.Mock }

  beforeAll(async () => {
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
      controllers: [AuthController],
      providers: [
        AuthService,
        UserRepository,
        PasswordResetTokenRepository,
        { provide: EMAIL_SERVICE, useValue: mockEmailService },
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

    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    mockEmailService.send.mockClear()
    await dataSource.query(
      `DELETE FROM identity."password_reset_token" WHERE "userId" IN (SELECT id FROM identity."user" WHERE email LIKE $1)`,
      ['%@e2e.test'],
    )
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, [
      '%@e2e.test',
    ])
  })

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM identity."password_reset_token" WHERE "userId" IN (SELECT id FROM identity."user" WHERE email LIKE $1)`,
      ['%@e2e.test'],
    )
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, [
      '%@e2e.test',
    ])
    await app?.close()
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
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validPayload)
        .expect(201)

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validPayload)
        .expect(409)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'login@e2e.test',
          password: 'password123',
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
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'forgot@e2e.test',
          password: 'password123',
          displayName: 'Forgot User',
        })

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
      // Arrange — register then set to inactive
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'inactive@e2e.test',
          password: 'password123',
          displayName: 'Inactive User',
        })
      await dataSource.query(
        `UPDATE identity."user" SET status = $1 WHERE email = $2`,
        [EUserStatus.INACTIVE, 'inactive@e2e.test'],
      )

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'inactive@e2e.test' })
        .expect(202)

      // Assert — no token should be created
      expect(response.body.message).toContain(
        'If an account with that email exists',
      )
      expect(mockEmailService.send).not.toHaveBeenCalled()
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
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'expired@e2e.test',
          password: 'password123',
          displayName: 'Expired User',
        })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')
      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          ['expired@e2e.test'],
        )
      )[0].id

      // Expired 1 hour ago
      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() - 3600000)],
      )

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'newPassword456' })
        .expect(400)
    })

    it('should return 200 for valid token and update password', async () => {
      // Arrange — register user
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'reset@e2e.test',
          password: 'oldPassword123',
          displayName: 'Reset User',
        })

      // Create token directly in DB
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')
      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          ['reset@e2e.test'],
        )
      )[0].id

      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() + 3600000)],
      )

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
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'usedtoken@e2e.test',
          password: 'password123',
          displayName: 'Used Token User',
        })

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')
      const userId = (
        await dataSource.query(
          `SELECT id FROM identity."user" WHERE email = $1`,
          ['usedtoken@e2e.test'],
        )
      )[0].id

      await dataSource.query(
        `INSERT INTO identity."password_reset_token" ("tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3)`,
        [tokenHash, userId, new Date(Date.now() + 3600000)],
      )

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
