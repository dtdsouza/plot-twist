import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import * as request from 'supertest'
import { DataSource } from 'typeorm'
import { Client } from 'pg'
import { AuthController } from '../auth.controller'
import { AuthService } from '../../../core/auth.service'
import { UserEntity } from '../../../persistence/entity/user.entity'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('AuthController (e2e)', () => {
  let app: INestApplication
  let dataSource: DataSource
  let module: TestingModule

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

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [UserEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserEntity]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [AuthService],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    )
    await app.init()

    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    // Clean up only this suite's rows to allow parallel execution with other test files
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, ['%@e2e.test'])
  })

  afterAll(async () => {
    await dataSource.query(`DELETE FROM identity."user" WHERE email LIKE $1`, ['%@e2e.test'])
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
      // Register a user to log in with
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
})
