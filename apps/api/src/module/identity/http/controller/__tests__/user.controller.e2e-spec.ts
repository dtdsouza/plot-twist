import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as request from 'supertest'
import { AuthController } from '../auth.controller'
import { UserController } from '../user.controller'
import { AuthService } from '../../../core/auth.service'
import { UserService } from '../../../core/user.service'
import { EmailChangeService } from '../../../core/email-change.service'
import { AvatarService } from '../../../core/avatar.service'
import { UserEntity } from '../../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../../persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from '../../../persistence/entity/email-change-token.entity'
import { UserRepository } from '../../../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../../../persistence/repository/password-reset-token.repository'
import { EmailChangeTokenRepository } from '../../../persistence/repository/email-change-token.repository'
import { JwtAuthGuard } from '../../guard/jwt-auth.guard'
import { EmailClient } from '@module/shared/mail'
import { closeTestPool } from '@module/shared/test-support'
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

describe('UserController (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let jwtService: JwtService

  const seededUser = {
    email: 'me@e2e.test',
    displayName: 'Me User',
  }
  let seededUserId: string
  let seededUserToken: string

  beforeAll(async () => {
    await ensureIdentitySchema()

    const mockEmailClient = {
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
      controllers: [AuthController, UserController],
      providers: [
        AuthService,
        UserService,
        EmailChangeService,
        {
          provide: AvatarService,
          useValue: {
            initiateUpload: jest.fn(),
            finalize: jest.fn(),
          },
        },
        JwtAuthGuard,
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

    jwtService = module.get<JwtService>(JwtService)
  })

  beforeEach(async () => {
    await truncateIdentity()

    const user = await createUser({
      email: seededUser.email,
      displayName: seededUser.displayName,
    })
    seededUserId = user.id
    seededUserToken = jwtService.sign({
      sub: user.id,
      email: user.email,
    })
  })

  afterAll(async () => {
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
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
