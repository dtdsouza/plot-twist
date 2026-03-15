import { appConfig, APP_CONFIG_KEY } from '../segment/app.config'

describe('appConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PORT: '4000',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should have the correct config key', () => {
    expect(APP_CONFIG_KEY).toBe('app')
  })

  it('should return config from process.env', () => {
    const config = appConfig()

    expect(config.port).toBe(4000)
    expect(config.nodeEnv).toBe('production')
    expect(config.isProduction).toBe(true)
  })

  it('should return a frozen object', () => {
    const config = appConfig()

    expect(Object.isFrozen(config)).toBe(true)
  })

  it('should set isProduction to false for non-production env', () => {
    process.env.NODE_ENV = 'development'

    const config = appConfig()

    expect(config.isProduction).toBe(false)
  })
})
