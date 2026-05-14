import { Test, TestingModule } from '@nestjs/testing'

describe('ConfigModule', () => {
  const originalEnv = process.env
  let module: TestingModule

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PORT: '3333',
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'postgres',
      DB_NAME: 'plot-twist',
      DB_SYNCHRONIZE: 'false',
      DB_LOGGING: 'false',
      JWT_SECRET: 'test-secret-long-enough-for-validation',
      JWT_EXPIRES_IN: '7d',
      RESEND_API_KEY: 're_test_placeholder',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
    }
  })

  afterEach(async () => {
    process.env = originalEnv
    await module?.close()
  })

  async function createModule() {
    const { ConfigModule } = await import('../config.module')
    const { ConfigService } = await import('@nestjs/config')

    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
    }).compile()

    return module.get(ConfigService)
  }

  it('should provide ConfigService with app config', async () => {
    const config = await createModule()

    expect(config.get('app.port')).toBe(3333)
    expect(config.get('app.nodeEnv')).toBe('test')
    expect(config.get('app.isProduction')).toBe(false)
  })

  it('should provide ConfigService with database config', async () => {
    const config = await createModule()

    expect(config.get('database.type')).toBe('postgres')
    expect(config.get('database.host')).toBe('127.0.0.1')
    expect(config.get('database.port')).toBe(5432)
  })

  it('should provide ConfigService with jwt config', async () => {
    const config = await createModule()

    expect(config.get('jwt.secret')).toBe('test-secret-long-enough-for-validation')
    expect(config.get('jwt.expiresIn')).toBe('7d')
  })

  it('should throw on missing JWT_SECRET', async () => {
    delete process.env.JWT_SECRET

    const { ConfigModule } = await import('../config.module')

    await expect(
      Test.createTestingModule({
        imports: [ConfigModule.forRoot()],
      }).compile(),
    ).rejects.toThrow('Environment validation failed')
  })

  it('should throw on invalid NODE_ENV', async () => {
    process.env.NODE_ENV = 'invalid'

    const { ConfigModule } = await import('../config.module')

    await expect(
      Test.createTestingModule({
        imports: [ConfigModule.forRoot()],
      }).compile(),
    ).rejects.toThrow('Environment validation failed')
  })
})
