import { databaseConfig, DATABASE_CONFIG_KEY } from '../segment/database.config'

describe('databaseConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_HOST: '10.0.0.1',
      DB_PORT: '5433',
      DB_USERNAME: 'admin',
      DB_PASSWORD: 'secret',
      DB_NAME: 'mydb',
      DB_SYNCHRONIZE: 'true',
      DB_LOGGING: 'true',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should have the correct config key', () => {
    expect(DATABASE_CONFIG_KEY).toBe('database')
  })

  it('should return config from process.env', () => {
    const config = databaseConfig()

    expect(config.type).toBe('postgres')
    expect(config.host).toBe('10.0.0.1')
    expect(config.port).toBe(5433)
    expect(config.username).toBe('admin')
    expect(config.password).toBe('secret')
    expect(config.database).toBe('mydb')
    expect(config.synchronize).toBe(true)
    expect(config.logging).toBe(true)
  })

  it('should return a frozen object', () => {
    const config = databaseConfig()

    expect(Object.isFrozen(config)).toBe(true)
  })
})
