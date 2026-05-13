export interface ISendEmailOptions {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
}
