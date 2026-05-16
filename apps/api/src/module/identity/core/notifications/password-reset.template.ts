import type { ISendEmailOptions } from '@module/shared/mail'

export interface IPasswordResetTemplateInput {
  readonly to: string
  readonly resetUrl: string
}

export function buildPasswordResetEmail(
  input: IPasswordResetTemplateInput,
): ISendEmailOptions {
  return {
    to: input.to,
    subject: 'Reset your Plot-Twist password',
    html: `<p>You requested a password reset.</p><p><a href="${input.resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, you can safely ignore this email.</p>`,
    text: `You requested a password reset. Visit this link to reset your password: ${input.resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
  }
}
