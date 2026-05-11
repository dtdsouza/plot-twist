import { envSchema } from '../env.schema'

describe('envSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3333',
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'plot-twist',
    DB_SYNCHRONIZE: 'false',
    DB_LOGGING: 'false',
    JWT_SECRET: 'a-secret-that-is-long-enough',
    JWT_EXPIRES_IN: '7d',
    RESEND_API_KEY: 're_test_api_key',
    RESEND_FROM_ADDRESS: 'Plot-Twist <onboarding@resend.dev>',
    PASSWORD_RESET_URL: 'http://localhost:4200/reset-password',
    EMAIL_CHANGE_VERIFICATION_URL: 'http://localhost:4200/verify-email-change',
  }

  it('should parse a fully valid env', () => {
    const result = envSchema.parse(validEnv)

    expect(result.NODE_ENV).toBe('development')
    expect(result.PORT).toBe(3333)
    expect(result.DB_HOST).toBe('127.0.0.1')
    expect(result.DB_PORT).toBe(5432)
    expect(result.DB_SYNCHRONIZE).toBe(false)
    expect(result.DB_LOGGING).toBe(false)
    expect(result.JWT_SECRET).toBe('a-secret-that-is-long-enough')
    expect(result.JWT_EXPIRES_IN).toBe('7d')
    expect(result.RESEND_API_KEY).toBe('re_test_api_key')
    expect(result.RESEND_FROM_ADDRESS).toBe('Plot-Twist <onboarding@resend.dev>')
    expect(result.PASSWORD_RESET_URL).toBe('http://localhost:4200/reset-password')
    expect(result.EMAIL_CHANGE_VERIFICATION_URL).toBe('http://localhost:4200/verify-email-change')
  })

  it('should apply defaults when optional fields are omitted', () => {
    const minimal = {
      JWT_SECRET: 'a-secret-that-is-long-enough',
      RESEND_API_KEY: 're_test_api_key',
    }

    const result = envSchema.parse(minimal)

    expect(result.NODE_ENV).toBe('development')
    expect(result.PORT).toBe(3333)
    expect(result.DB_HOST).toBe('127.0.0.1')
    expect(result.DB_PORT).toBe(5432)
    expect(result.DB_USERNAME).toBe('postgres')
    expect(result.DB_PASSWORD).toBe('postgres')
    expect(result.DB_NAME).toBe('plot-twist')
    expect(result.DB_SYNCHRONIZE).toBe(false)
    expect(result.DB_LOGGING).toBe(false)
    expect(result.JWT_EXPIRES_IN).toBe('7d')
    expect(result.RESEND_API_KEY).toBe('re_test_api_key')
    expect(result.RESEND_FROM_ADDRESS).toBe('Plot-Twist <onboarding@resend.dev>')
    expect(result.PASSWORD_RESET_URL).toBe('http://localhost:4200/reset-password')
    expect(result.EMAIL_CHANGE_VERIFICATION_URL).toBe('http://localhost:4200/verify-email-change')
  })

  it('should reject missing JWT_SECRET', () => {
    const withoutSecret = { ...validEnv }
    delete (withoutSecret as Record<string, unknown>).JWT_SECRET

    expect(() => envSchema.parse(withoutSecret)).toThrow()
  })

  it('should reject JWT_SECRET shorter than 16 characters', () => {
    const shortSecret = { ...validEnv, JWT_SECRET: 'short' }

    expect(() => envSchema.parse(shortSecret)).toThrow()
  })

  it('should reject invalid NODE_ENV', () => {
    const badEnv = { ...validEnv, NODE_ENV: 'invalid' }

    expect(() => envSchema.parse(badEnv)).toThrow()
  })

  it('should coerce PORT from string to number', () => {
    const result = envSchema.parse(validEnv)

    expect(typeof result.PORT).toBe('number')
  })

  it('should reject non-numeric PORT', () => {
    const badPort = { ...validEnv, PORT: 'not-a-number' }

    expect(() => envSchema.parse(badPort)).toThrow()
  })

  it('should coerce DB_SYNCHRONIZE string to boolean', () => {
    const withTrue = { ...validEnv, DB_SYNCHRONIZE: 'true' }
    const withFalse = { ...validEnv, DB_SYNCHRONIZE: 'false' }

    expect(envSchema.parse(withTrue).DB_SYNCHRONIZE).toBe(true)
    expect(envSchema.parse(withFalse).DB_SYNCHRONIZE).toBe(false)
  })

  it('should accept all valid NODE_ENV values', () => {
    for (const nodeEnv of ['development', 'production', 'test']) {
      const result = envSchema.parse({ ...validEnv, NODE_ENV: nodeEnv })
      expect(result.NODE_ENV).toBe(nodeEnv)
    }
  })
})
