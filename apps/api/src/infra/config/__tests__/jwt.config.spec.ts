import { jwtConfig, JWT_CONFIG_KEY } from '../segment/jwt.config'

describe('jwtConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'my-super-secret-key-for-testing',
      JWT_EXPIRES_IN: '24h',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should have the correct config key', () => {
    expect(JWT_CONFIG_KEY).toBe('jwt')
  })

  it('should return config from process.env', () => {
    const config = jwtConfig()

    expect(config.secret).toBe('my-super-secret-key-for-testing')
    expect(config.expiresIn).toBe('24h')
  })

  it('should return a frozen object', () => {
    const config = jwtConfig()

    expect(Object.isFrozen(config)).toBe(true)
  })
})
