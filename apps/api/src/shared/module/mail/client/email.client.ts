import { Inject, Injectable, Logger } from '@nestjs/common'
import type { ISendEmailOptions } from '../interface/send-email-options.interface'
import {
  EMAIL_PROVIDER,
  type IEmailProvider,
} from '../provider/email-provider.interface'

@Injectable()
export class EmailClient {
  private readonly logger = new Logger(EmailClient.name)

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: IEmailProvider,
  ) {}

  async send(options: ISendEmailOptions): Promise<void> {
    this.logger.log(`send to=${options.to} subject="${options.subject}"`)

    try {
      await this.provider.send(options)
      this.logger.log(`sent to=${options.to}`)
    } catch (error) {
      this.logger.error(`failed to=${options.to}`, error as Error)
      throw error
    }
  }
}
