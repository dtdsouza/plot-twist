import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'
import { MAIL_CONFIG_KEY, type IMailConfig } from '@module/shared/config'
import type { IEmailService, ISendEmailOptions } from './interface/email-service.interface'

@Injectable()
export class ResendEmailService implements IEmailService {
  private readonly logger = new Logger('Infra.ResendEmailService')
  private readonly resend!: Resend
  private readonly fromAddress!: string

  constructor(private readonly configService: ConfigService) {
    const mailConfig = this.configService.getOrThrow<IMailConfig>(MAIL_CONFIG_KEY)
    this.resend = new Resend(mailConfig.apiKey)
    this.fromAddress = mailConfig.fromAddress
  }

  async send(options: ISendEmailOptions): Promise<void> {
    this.logger.log(`Sending email to ${options.to}: ${options.subject}`)

    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    if (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error)
      throw error
    }

    this.logger.log(`Email sent successfully to ${options.to}, id: ${data?.id}`)
  }

  async sendEmailChangeVerification(
    toEmail: string,
    verificationUrl: string,
  ): Promise<void> {
    const subject = 'Verify your new Plot-Twist email'
    const html = `<p>You asked to change the email on your Plot-Twist account.</p><p><a href="${verificationUrl}">Tap here to confirm this is really you</a> and we will swap it over.</p><p>This link expires in 1 hour. If you did not request this, you can ignore the message and nothing changes.</p>`
    const text = `You asked to change the email on your Plot-Twist account. Confirm at: ${verificationUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore the message and nothing changes.`

    await this.send({ to: toEmail, subject, html, text })
  }
}
