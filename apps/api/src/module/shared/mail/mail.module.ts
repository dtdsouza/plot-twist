import { Module } from '@nestjs/common'
import { ResendEmailService } from './resend-email.service'
import { EMAIL_SERVICE } from './interface/email-service.interface'

@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useClass: ResendEmailService,
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class MailModule {}
