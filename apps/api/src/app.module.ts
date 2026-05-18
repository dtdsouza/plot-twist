import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ConfigModule } from '@module/shared/config'
import { LoggingModule } from '@module/shared/logging'
import { PersistenceModule } from '@module/shared/persistence'
import { HealthModule } from '@module/shared/health'
import { AuthModule } from '@module/shared/auth'
import { IdentityModule } from '@module/identity'
import { ClubsModule } from '@module/clubs'

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggingModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PersistenceModule,
    HealthModule,
    AuthModule,
    IdentityModule,
    ClubsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
