import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as request from 'supertest'
import { DataSource } from 'typeorm'
import { Client } from 'pg'
import { AuthController } from '../auth.controller'
import { UserController } from '../user.controller'
import { AuthService } from '../../../core/auth.service'
import { UserService } from '../../../core/user.service'
import { UserEntity } from '../../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../../persistence/entity/password-reset-token.entity'
import { UserRepository } from '../../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../../persistence/repository/password-reset-token.repository'
import { JwtAuthGuard } from '../../guard/jwt-auth.guard'
import { EMAIL_SERVICE } from '@module/shared/mail'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('UserController (e2e)', () => {
  let app: INestApplication
  let dataSource: DataSource
  let module: TestingModule
  let jwtService: JwtService

  const seededUser = {
    email: 'me@e2e.test',
    password: 'password123',
    displayName: 'Me User',
  }
  let seededUserId: string
  let seededUserToken: string

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

    const mockEmailService = { send: jest.fn().mockResolvedValue(undefined) }
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
      controllers: [AuthController, UserController],
      providers: [
        AuthService,
        UserService,
        JwtAuthGuard,
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
    jwtService = module.get<JwtService>(JwtService)
  })

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM identity."password_reset_token" WHERE "userId" IN (SELECT id FROM identity."user" WHERE email LIKE $1)`,
      ['%@e2e.test'],
    )
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, [
      '%@e2e.test',
    ])

    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(seededUser)
      .expect(201)

    seededUserId = registerResponse.body.user.id
    seededUserToken = registerResponse.body.accessToken
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

  describe('GET /api/user/me', () => {
    it('should return 401 when authorization header is missing', async () => {
      await request(app.getHttpServer()).get('/api/user/me').expect(401)
    })

    it('should return 401 when scheme is not Bearer', async () => {
      await request(app.getHttpServer())
        .get('/api/user/me')
        .set('Authorization', `Basic ${seededUserToken}`)
        .expect(401)
    })

    it('should return 401 when token is invalid', async () => {
      await request(app.getHttpServer())
        .get('/api/user/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401)
    })

    it('should return 200 and user response with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/user/me')
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(200)

      expect(response.body.id).toBe(seededUserId)
      expect(response.body.email).toBe(seededUser.email)
      expect(response.body.displayName).toBe(seededUser.displayName)
      expect(response.body.createdAt).toBeDefined()
    })

    it('should not include passwordHash in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/user/me')
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(200)

      expect(response.body).not.toHaveProperty('passwordHash')
    })
  })

  describe('GET /api/user/:id', () => {
    it('should return 401 when authorization header is missing', async () => {
      await request(app.getHttpServer())
        .get(`/api/user/${seededUserId}`)
        .expect(401)
    })

    it('should return 400 when id is not a valid uuid', async () => {
      await request(app.getHttpServer())
        .get('/api/user/not-a-uuid')
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(400)
    })

    it('should return 404 when user does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/user/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(404)
    })

    it('should return 200 and user response for existing id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/user/${seededUserId}`)
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(200)

      expect(response.body.id).toBe(seededUserId)
      expect(response.body.email).toBe(seededUser.email)
      expect(response.body.displayName).toBe(seededUser.displayName)
    })

    it('should not include passwordHash in response', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/user/${seededUserId}`)
        .set('Authorization', `Bearer ${seededUserToken}`)
        .expect(200)

      expect(response.body).not.toHaveProperty('passwordHash')
    })

    it('should accept a manually-signed JWT for the seeded user', async () => {
      const manualToken = jwtService.sign({
        sub: seededUserId,
        email: seededUser.email,
      })

      const response = await request(app.getHttpServer())
        .get(`/api/user/${seededUserId}`)
        .set('Authorization', `Bearer ${manualToken}`)
        .expect(200)

      expect(response.body.id).toBe(seededUserId)
    })
  })
})
