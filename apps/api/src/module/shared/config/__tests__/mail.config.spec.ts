import { mailConfig, MAIL_CONFIG_KEY } from '../segment/mail.config'

describe('mailConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: 're_test_api_key',
      RESEND_FROM_ADDRESS: 'Plot-Twist <onboarding@resend.dev>',
      PASSWORD_RESET_URL: 'http://localhost:4200/reset-password',
      EMAIL_CHANGE_VERIFICATION_URL: 'http://localhost:4200/verify-email-change',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should have the correct config key', () => {
    expect(MAIL_CONFIG_KEY).toBe('mail')
  })

  it('should return config from process.env', () => {
    const config = mailConfig()

    expect(config.apiKey).toBe('re_test_api_key')
    expect(config.fromAddress).toBe('Plot-Twist <onboarding@resend.dev>')
    expect(config.passwordResetUrl).toBe('http://localhost:4200/reset-password')
    expect(config.emailChangeVerificationUrl).toBe('http://localhost:4200/verify-email-change')
  })

  it('should return a frozen object', () => {
    const config = mailConfig()

    expect(Object.isFrozen(config)).toBe(true)
  })
})
