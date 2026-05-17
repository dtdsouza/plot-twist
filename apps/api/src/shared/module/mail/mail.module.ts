import { Module } from '@nestjs/common'
import { EmailClient } from './client/email.client'
import { EMAIL_PROVIDER } from './provider/email-provider.interface'
import { ResendEmailProvider } from './provider/resend.provider'

@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: ResendEmailProvider,
    },
    EmailClient,
  ],
  exports: [EmailClient],
})
export class MailModule {}
