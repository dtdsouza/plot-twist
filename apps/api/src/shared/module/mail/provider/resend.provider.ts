import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'
import { MAIL_CONFIG_KEY, type IMailConfig } from '@module/shared/config'
import type { ISendEmailOptions } from '../interface/send-email-options.interface'
import type { IEmailProvider } from './email-provider.interface'

@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private readonly resend: Resend
  private readonly fromAddress: string

  constructor(configService: ConfigService) {
    const mailConfig = configService.getOrThrow<IMailConfig>(MAIL_CONFIG_KEY)
    this.resend = new Resend(mailConfig.apiKey)
    this.fromAddress = mailConfig.fromAddress
  }

  async send(options: ISendEmailOptions): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    if (error) {
      throw error
    }
  }
}
