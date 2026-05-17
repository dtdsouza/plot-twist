import type { ISendEmailOptions } from '../interface/send-email-options.interface'

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER')

export interface IEmailProvider {
  send(options: ISendEmailOptions): Promise<void>
}
