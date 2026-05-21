import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import {
  S3Client,
  CreateBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import * as request from 'supertest'
import { ClubsController } from '../http/controller/clubs.controller'
import { ClubService } from '../core/club.service'
import { ClubCoverService } from '../core/club-cover.service'
import { ClubEntity } from '../persistence/entity/club.entity'
import { MembershipEntity } from '../persistence/entity/membership.entity'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import { JwtAuthGuard } from '@module/shared/auth'
import { StorageModule } from '@module/shared/storage'
import { storageConfig as storageConfigSegment } from '@module/shared/config'
import { closeTestPool } from '@module/shared/test-support'
import {
  CLUBS_TEST_ENTITIES,
  createClub,
  createMembership,
  ensureClubsSchema,
  truncateClubs,
} from '@module/clubs/test-support'
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
const S3_BUCKET = process.env.S3_BUCKET_CLUB_COVERS ?? 'plot-twist-club-covers'

const STORAGE_ENV = {
  S3_REGION: 'us-east-1',
  S3_ENDPOINT,
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  S3_BUCKET_AVATARS: process.env.S3_BUCKET_AVATARS ?? 'plot-twist-avatars',
  S3_BUCKET_CLUB_COVERS: S3_BUCKET,
  S3_PUBLIC_URL_BASE: '',
  MAX_AVATAR_SIZE_BYTES: '2097152',
  MAX_AVATAR_DIMENSION: '2048',
  AVATAR_ALLOWED_MIME: 'image/jpeg,image/png,image/webp',
  MAX_CLUB_COVER_SIZE_BYTES: '5242880',
  MAX_CLUB_COVER_DIMENSION: '4096',
  CLUB_COVER_ALLOWED_MIME: 'image/jpeg,image/png,image/webp',
  PRESIGNED_POST_TTL_SECONDS: '300',
}

// Tiny valid 1x1 PNG
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
  'hex',
)

// 4 bytes of random data — not a valid image
const FAKE_BINARY = Buffer.from([0x00, 0x00, 0x00, 0x00])

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
    'cover.png',
  )
  const response = await fetch(url, { method: 'POST', body: form })
  return response.status
}

async function headObject(key: string): Promise<boolean> {
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: S3_ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    forcePathStyle: true,
  })
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

describe('Club cover upload (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let jwtService: JwtService

  const ownerEmail = 'cover-owner@clubs.e2e'
  const nonOwnerEmail = 'cover-member@clubs.e2e'
  let ownerId: string
  let ownerToken: string
  let nonOwnerId: string
  let nonOwnerToken: string
  let clubId: string

  beforeAll(async () => {
    await ensureIdentitySchema()
    await ensureClubsSchema()

    // Set env vars before module init (storageConfig segment reads process.env)
    Object.assign(process.env, STORAGE_ENV)

    // Ensure bucket exists in LocalStack
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      forcePathStyle: true,
    })
    try {
      await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }))
    } catch {
      // Bucket may already exist — ignore
    }

    module = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfigSegment],
          ignoreEnvFile: true,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [...CLUBS_TEST_ENTITIES],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ClubEntity, MembershipEntity]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
        StorageModule,
      ],
      controllers: [ClubsController],
      providers: [
        ClubService,
        ClubCoverService,
        ClubRepository,
        MembershipRepository,
        JwtAuthGuard,
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
    await truncateClubs()
    await truncateIdentity()

    const owner = await createUser({ email: ownerEmail, displayName: 'Cover Owner' })
    ownerId = owner.id
    ownerToken = jwtService.sign({ sub: owner.id, email: owner.email })

    const nonOwner = await createUser({ email: nonOwnerEmail, displayName: 'Cover Member' })
    nonOwnerId = nonOwner.id
    nonOwnerToken = jwtService.sign({ sub: nonOwner.id, email: nonOwner.email })

    const club = await createClub({ ownerId: owner.id, name: 'Cover Club' })
    clubId = club.id
    await createMembership({ clubId: club.id, userId: owner.id, role: 'owner' })
    await createMembership({ clubId: club.id, userId: nonOwner.id, role: 'member' })
  })

  afterAll(async () => {
    await truncateClubs()
    await truncateIdentity()
    await app?.close()
    await closeTestPool()
  })

  describe('POST /api/clubs/:id/cover/upload-intent', () => {
    it('403 — non-owner member is rejected', async () => {
      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ contentType: 'image/png', contentLength: 1000 })
        .expect(403)
    })

    it('400 — rejects unsupported content type', async () => {
      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/svg+xml', contentLength: 1000 })
        .expect(400)
    })

    it('400 — rejects content-length over the cap', async () => {
      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: 5_242_881 })
        .expect(400)
    })

    it('200 — owner gets a presigned post with staging key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: 1000 })
        .expect(200)

      expect(response.body.key).toMatch(
        new RegExp(`^clubs/${clubId}/cover/pending/[0-9a-f-]{36}$`),
      )
      expect(response.body.url).toContain(S3_BUCKET)
      expect(response.body.fields).toBeDefined()
    })
  })

  describe('end-to-end intent -> S3 upload -> finalize', () => {
    it('happy path: coverImageUrl is set, staging object deleted, GET reflects new URL', async () => {
      // 1. intent
      const intent = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: PNG_1x1.length })
        .expect(200)

      const stagingKey = intent.body.key as string

      // 2. upload to LocalStack
      const status = await uploadDirectly(
        intent.body.url,
        intent.body.fields,
        PNG_1x1,
        'image/png',
      )
      expect([200, 201, 204]).toContain(status)

      // 3. finalize
      const finalize = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: stagingKey })
        .expect(200)

      expect(finalize.body.coverImageUrl).toBeTruthy()
      expect(finalize.body.coverImageUrl).toMatch(
        new RegExp(`clubs/${clubId}/cover/[0-9a-f-]+\\.png$`),
      )

      // 4. GET /api/clubs/:id reflects new coverImageUrl
      const getResponse = await request(app.getHttpServer())
        .get(`/api/clubs/${clubId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
      expect(getResponse.body.coverImageUrl).toBe(finalize.body.coverImageUrl)

      // 5. staging object is gone
      const stagingExists = await headObject(stagingKey)
      expect(stagingExists).toBe(false)
    })

    it('second upload deletes prior cover from S3', async () => {
      // First upload
      const intent1 = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: PNG_1x1.length })
        .expect(200)

      await uploadDirectly(intent1.body.url, intent1.body.fields, PNG_1x1, 'image/png')
      const finalize1 = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: intent1.body.key })
        .expect(200)

      const firstCoverUrl = finalize1.body.coverImageUrl as string
      // Extract key from URL — it ends after the bucket prefix
      const urlParts = firstCoverUrl.split(`${S3_BUCKET}/`)
      const firstCoverKey = urlParts[urlParts.length - 1]

      // Second upload
      const intent2 = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: PNG_1x1.length })
        .expect(200)

      await uploadDirectly(intent2.body.url, intent2.body.fields, PNG_1x1, 'image/png')
      const finalize2 = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: intent2.body.key })
        .expect(200)

      expect(finalize2.body.coverImageUrl).not.toBe(firstCoverUrl)

      // Prior cover should be gone
      const priorExists = await headObject(firstCoverKey)
      expect(priorExists).toBe(false)
    })

    it('cross-club key at finalize returns 403/400', async () => {
      // A key belonging to a different club
      const crossKey = `clubs/00000000-0000-0000-0000-000000000000/cover/pending/some-upload-id`

      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: crossKey })
        .expect((res) => {
          expect([400, 403]).toContain(res.status)
        })
    })

    it('disguised non-image file returns 400 and pending object is deleted', async () => {
      // 1. intent
      const intent = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: FAKE_BINARY.length })
        .expect(200)

      const stagingKey = intent.body.key as string

      // 2. Upload fake binary to S3 (bypass content-type check at presigned POST level)
      await uploadDirectly(intent.body.url, intent.body.fields, FAKE_BINARY, 'image/png')

      // 3. finalize — should reject due to magic-byte sniff failure
      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: stagingKey })
        .expect(400)

      // 4. pending object should be cleaned up
      const stagingExists = await headObject(stagingKey)
      expect(stagingExists).toBe(false)
    })

    it('404 when finalize references a key with no uploaded object', async () => {
      const intent = await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/upload-intent`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ contentType: 'image/png', contentLength: 100 })
        .expect(200)

      // Don't actually upload — call finalize with the unuploaded key
      await request(app.getHttpServer())
        .post(`/api/clubs/${clubId}/cover/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ key: intent.body.key })
        .expect(404)
    })
  })
})
