export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE')

export interface ISendEmailOptions {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
}

export interface IEmailService {
  send(options: ISendEmailOptions): Promise<void>
}
