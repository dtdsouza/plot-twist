import { buildDataSourceOptions } from '../data-source.options'

describe('buildDataSourceOptions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_USERNAME: 'testuser',
      DB_PASSWORD: 'testpass',
      DB_NAME: 'testdb',
      DB_SYNCHRONIZE: 'false',
      DB_LOGGING: 'true',
      JWT_SECRET: 'test-secret-minimum-16',
      RESEND_API_KEY: 'test-resend-key',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return DataSourceOptions with correct fields from env vars', () => {
    // Act
    const options = buildDataSourceOptions()

    // Assert
    expect(options).toEqual(
      expect.objectContaining({
        type: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        username: 'testuser',
        password: 'testpass',
        database: 'testdb',
        synchronize: false,
        logging: true,
      }),
    )
  })

  it('should merge overrides into the base options', () => {
    // Act
    const options = buildDataSourceOptions({
      logging: false,
      entities: ['src/**/*.entity.ts'],
    })

    // Assert
    expect(options.logging).toBe(false)
    expect(options.entities).toEqual(['src/**/*.entity.ts'])
  })

  it('should throw ZodError when required env vars are missing', () => {
    // Arrange
    delete process.env.JWT_SECRET
    delete process.env.RESEND_API_KEY

    // Act & Assert
    expect(() => buildDataSourceOptions()).toThrow()
  })
})
