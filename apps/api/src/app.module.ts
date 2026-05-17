import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ConfigModule } from '@module/shared/config'
import { LoggingModule } from '@module/shared/logging'
import { PersistenceModule } from '@module/shared/persistence'
import { IdentityModule } from '@module/identity'

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggingModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PersistenceModule,
    IdentityModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
