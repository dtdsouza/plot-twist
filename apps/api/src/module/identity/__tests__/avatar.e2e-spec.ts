import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import * as request from 'supertest'
import { AuthController } from '../http/controller/auth.controller'
import { UserController } from '../http/controller/user.controller'
import { AuthService } from '../core/auth.service'
import { UserService } from '../core/user.service'
import { EmailChangeService } from '../core/email-change.service'
import { AvatarService } from '../core/avatar.service'
import { UserEntity } from '../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from '../persistence/entity/email-change-token.entity'
import { UserRepository } from '../persistence/repository/user.repository'
import { PasswordResetTokenRepository } from '../persistence/repository/password-reset-token.repository'
import { EmailChangeTokenRepository } from '../persistence/repository/email-change-token.repository'
import { JwtAuthGuard } from '@module/shared/auth'
import { EmailClient } from '@module/shared/mail'
import { StorageModule } from '@module/shared/storage'
import { storageConfig as storageConfigSegment, mailConfig as mailConfigSegment } from '@module/shared/config'
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

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:4566'
const S3_BUCKET = process.env.S3_BUCKET_AVATARS ?? 'plot-twist-avatars'

const STORAGE_ENV = {
  S3_REGION: 'us-east-1',
  S3_ENDPOINT,
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  S3_BUCKET_AVATARS: S3_BUCKET,
  S3_PUBLIC_URL_BASE: '',
  MAX_AVATAR_SIZE_BYTES: '2097152',
  MAX_AVATAR_DIMENSION: '2048',
  AVATAR_ALLOWED_MIME: 'image/jpeg,image/png,image/webp',
  PRESIGNED_POST_TTL_SECONDS: '300',
  PASSWORD_RESET_URL: 'http://localhost:4200/reset-password',
  EMAIL_CHANGE_VERIFICATION_URL: 'http://localhost:4200/verify-email-change',
}

const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
  'hex',
)

const TINY_PNG_2x2_BUFFER_HEX =
  '89504e470d0a1a0a0000000d49484452000000020000000208060000007297f6ad0000001049444154789c63606060f8cfc00010000300010092f8a0090000000049454e44ae426082'

const PNG_2x2 = Buffer.from(TINY_PNG_2x2_BUFFER_HEX, 'hex')

async function uploadDirectly(
  url: string,
  fields: Record<string, string>,
  body: Buffer,
  contentType: string,
): Promise<number> {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v)
  }
  form.append(
    'file',
    new Blob([new Uint8Array(body)], { type: contentType }),
    'avatar.png',
  )

  const response = await fetch(url, { method: 'POST', body: form })
  return response.status
}

describe('Avatar upload (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let jwtService: JwtService

  const seededUser = {
    email: 'avatar@e2e.test',
    displayName: 'Avatar User',
  }
  let token: string
  let userId: string

  beforeAll(async () => {
    await ensureIdentitySchema()

    const mockEmailClient = { send: jest.fn().mockResolvedValue(undefined) }

    Object.assign(process.env, STORAGE_ENV)

    module = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfigSegment, mailConfigSegment],
          ignoreEnvFile: true,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [
            UserEntity,
            PasswordResetTokenEntity,
            EmailChangeTokenEntity,
          ],
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
        StorageModule,
      ],
      controllers: [AuthController, UserController],
      providers: [
        AuthService,
        UserService,
        EmailChangeService,
        AvatarService,
        JwtAuthGuard,
        UserRepository,
        PasswordResetTokenRepository,
        EmailChangeTokenRepository,
        { provide: EmailClient, useValue: mockEmailClient },
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
    userId = user.id
    token = jwtService.sign({ sub: user.id, email: user.email })
  })

  afterAll(async () => {
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
  })

  describe('POST /api/user/me/avatar/upload-intent', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .send({ contentType: 'image/png', contentLength: 100 })
        .expect(401)
    })

    it('returns 200 with presigned post fields under the user prefix', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: 1000 })
        .expect(200)

      expect(response.body.key).toMatch(
        new RegExp(`^avatars/pending/${userId}/[0-9a-f-]{36}$`),
      )
      expect(response.body.url).toContain(S3_BUCKET)
      expect(response.body.fields).toBeDefined()
      expect(response.body.limits.maxContentLength).toBe(2_097_152)
    })

    it('returns 400 for an unsupported content type', async () => {
      await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/svg+xml', contentLength: 100 })
        .expect(400)
    })

    it('returns 400 for content-length over the cap', async () => {
      await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: 3_000_000 })
        .expect(400)
    })
  })

  describe('end-to-end intent -> S3 upload -> finalize', () => {
    it('publishes a public avatar URL after a real S3 upload', async () => {
      // 1. intent
      const intent = await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: PNG_1x1.length })
        .expect(200)

      // 2. real POST to LocalStack
      const status = await uploadDirectly(
        intent.body.url,
        intent.body.fields,
        PNG_1x1,
        'image/png',
      )
      expect([200, 201, 204]).toContain(status)

      // 3. finalize
      const finalize = await request(app.getHttpServer())
        .post('/api/user/me/avatar/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({ uploadKey: intent.body.key })
        .expect(200)

      expect(finalize.body.id).toBe(userId)
      expect(finalize.body.avatar).toBeTruthy()
      expect(finalize.body.avatar).toMatch(
        new RegExp(`/avatars/${userId}/[0-9a-f-]{36}\\.png$`),
      )

      // 4. public URL is fetchable
      const publicRes = await fetch(finalize.body.avatar)
      expect(publicRes.status).toBe(200)
    })

    it('replaces an existing avatar and removes the prior object', async () => {
      // upload first avatar
      const firstIntent = await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: PNG_1x1.length })
        .expect(200)

      await uploadDirectly(
        firstIntent.body.url,
        firstIntent.body.fields,
        PNG_1x1,
        'image/png',
      )
      const firstFinalize = await request(app.getHttpServer())
        .post('/api/user/me/avatar/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({ uploadKey: firstIntent.body.key })
        .expect(200)

      const firstAvatarUrl = firstFinalize.body.avatar as string

      // upload second avatar
      const secondIntent = await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: PNG_2x2.length })
        .expect(200)

      await uploadDirectly(
        secondIntent.body.url,
        secondIntent.body.fields,
        PNG_2x2,
        'image/png',
      )
      const secondFinalize = await request(app.getHttpServer())
        .post('/api/user/me/avatar/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({ uploadKey: secondIntent.body.key })
        .expect(200)

      expect(secondFinalize.body.avatar).not.toBe(firstAvatarUrl)

      // prior object should be gone
      const priorRes = await fetch(firstAvatarUrl)
      expect(priorRes.status).toBe(404)
    })

    it('rejects finalize for a key that belongs to another user', async () => {
      const fakeKey = `avatars/pending/00000000-0000-0000-0000-000000000000/some-id`
      await request(app.getHttpServer())
        .post('/api/user/me/avatar/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({ uploadKey: fakeKey })
        .expect(403)
    })

    it('returns 404 when finalize references a key with no uploaded object', async () => {
      const intent = await request(app.getHttpServer())
        .post('/api/user/me/avatar/upload-intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', contentLength: 100 })
        .expect(200)

      await request(app.getHttpServer())
        .post('/api/user/me/avatar/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({ uploadKey: intent.body.key })
        .expect(404)
    })
  })
})
