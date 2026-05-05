import { registerAs } from '@nestjs/config'

export const MAIL_CONFIG_KEY = 'mail' as const

export interface IMailConfig {
  readonly apiKey: string
  readonly fromAddress: string
  readonly passwordResetUrl: string
}

export const mailConfig = registerAs(MAIL_CONFIG_KEY, (): IMailConfig => {
  return Object.freeze({
    apiKey: process.env.RESEND_API_KEY as string,
    fromAddress: process.env.RESEND_FROM_ADDRESS as string,
    passwordResetUrl: process.env.PASSWORD_RESET_URL as string,
  })
})
