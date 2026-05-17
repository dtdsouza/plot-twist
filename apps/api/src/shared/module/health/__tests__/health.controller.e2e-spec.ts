import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TerminusModule } from '@nestjs/terminus'
import { DataSource } from 'typeorm'
import * as request from 'supertest'
import { HealthController } from '../health.controller'
import { ensureSchema, closeTestPool } from '@module/shared/test-support'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = parseInt(process.env.DB_PORT ?? '5432', 10)
const DB_USERNAME = process.env.DB_USERNAME ?? 'postgres'
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres'
const DB_NAME = process.env.DB_NAME ?? 'plot-twist'

describe('HealthController (e2e)', () => {
  let app: INestApplication
  let module: TestingModule
  let dataSource: DataSource

  beforeAll(async () => {
    // Health check itself doesn't require a schema, but per-worker DB creation
    // is gated through ensureSchema which also creates the worker DB.
    await ensureSchema('public')

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: DB_HOST,
          port: DB_PORT,
          username: DB_USERNAME,
          password: DB_PASSWORD,
          database: DB_NAME,
          entities: [],
          synchronize: false,
        }),
        TerminusModule,
      ],
      controllers: [HealthController],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()

    dataSource = module.get(DataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
    await app?.close()
    await closeTestPool()
  })

  describe('GET /api/health', () => {
    it('returns 200 with database status "up" when DB is reachable', async () => {
      const response = await request(app.getHttpServer()).get('/api/health')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' } },
        details: { database: { status: 'up' } },
      })
    })

    it('returns 503 with database error when DB is unreachable', async () => {
      await dataSource.destroy()

      const response = await request(app.getHttpServer()).get('/api/health')

      expect(response.status).toBe(503)
      expect(response.body.status).toBe('error')
      expect(response.body.error).toHaveProperty('database')
      expect(response.body.error.database.status).toBe('down')
    })
  })
})
