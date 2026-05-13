import { buildEmailChangeVerificationEmail } from '../email-change.template'

describe('buildEmailChangeVerificationEmail', () => {
  const input = {
    to: 'new@example.com',
    verificationUrl: 'http://localhost:4200/verify-email-change?token=abc',
  }

  it('targets the new email address', () => {
    expect(buildEmailChangeVerificationEmail(input).to).toBe('new@example.com')
  })

  it('uses the email change verification subject', () => {
    expect(buildEmailChangeVerificationEmail(input).subject).toBe(
      'Verify your new Plot-Twist email',
    )
  })

  it('embeds the verification URL in both html and text bodies', () => {
    const result = buildEmailChangeVerificationEmail(input)
    expect(result.html).toContain(input.verificationUrl)
    expect(result.text).toContain(input.verificationUrl)
  })

  it('communicates the 1 hour expiry in both bodies', () => {
    const result = buildEmailChangeVerificationEmail(input)
    expect(result.html).toContain('1 hour')
    expect(result.text).toContain('1 hour')
  })
})
