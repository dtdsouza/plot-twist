import type { ISendEmailOptions } from '@module/shared/mail'

export interface IEmailChangeTemplateInput {
  readonly to: string
  readonly verificationUrl: string
}

export function buildEmailChangeVerificationEmail(
  input: IEmailChangeTemplateInput,
): ISendEmailOptions {
  return {
    to: input.to,
    subject: 'Verify your new Plot-Twist email',
    html: `<p>You asked to change the email on your Plot-Twist account.</p><p><a href="${input.verificationUrl}">Tap here to confirm this is really you</a> and we will swap it over.</p><p>This link expires in 1 hour. If you did not request this, you can ignore the message and nothing changes.</p>`,
    text: `You asked to change the email on your Plot-Twist account. Confirm at: ${input.verificationUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore the message and nothing changes.`,
  }
}
