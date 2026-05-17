import { Test, TestingModule } from '@nestjs/testing'
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus'
import { HealthController } from '../health.controller'

describe('HealthController', () => {
  let controller: HealthController
  let mockHealthCheckService: { check: jest.Mock }
  let mockTypeOrmHealthIndicator: { pingCheck: jest.Mock }

  const mockResult: HealthCheckResult = {
    status: 'ok',
    info: { database: { status: 'up' } },
    error: {},
    details: { database: { status: 'up' } },
  }

  beforeEach(async () => {
    mockHealthCheckService = {
      check: jest.fn().mockImplementation(async (checks: Array<() => unknown>) => {
        await Promise.all(checks.map((c) => c()))
        return mockResult
      }),
    }
    mockTypeOrmHealthIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockTypeOrmHealthIndicator,
        },
      ],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('should run a database ping check under the "database" key', async () => {
    const result = await controller.check()

    expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1)
    expect(mockTypeOrmHealthIndicator.pingCheck).toHaveBeenCalledWith('database')
    expect(result).toEqual(mockResult)
  })

  it('should propagate the health check service error when DB is down', async () => {
    const failure = new Error('Service Unavailable')
    mockHealthCheckService.check.mockRejectedValueOnce(failure)

    await expect(controller.check()).rejects.toBe(failure)
  })
})
