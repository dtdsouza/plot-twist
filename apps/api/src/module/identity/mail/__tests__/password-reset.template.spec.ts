import { buildPasswordResetEmail } from '../password-reset.template'

describe('buildPasswordResetEmail', () => {
  const input = {
    to: 'user@example.com',
    resetUrl: 'http://localhost:4200/reset-password?token=abc',
  }

  it('targets the requested address', () => {
    expect(buildPasswordResetEmail(input).to).toBe('user@example.com')
  })

  it('uses the password reset subject', () => {
    expect(buildPasswordResetEmail(input).subject).toBe(
      'Reset your Plot-Twist password',
    )
  })

  it('embeds the reset URL in both html and text bodies', () => {
    const result = buildPasswordResetEmail(input)
    expect(result.html).toContain(input.resetUrl)
    expect(result.text).toContain(input.resetUrl)
  })

  it('communicates the 1 hour expiry in both bodies', () => {
    const result = buildPasswordResetEmail(input)
    expect(result.html).toContain('1 hour')
    expect(result.text).toContain('1 hour')
  })
})
