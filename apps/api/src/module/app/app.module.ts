import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ConfigModule } from '@module/shared/config'
import { PersistenceModule } from '@module/shared/persistence'
import { IdentityModule } from '@module/identity'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PersistenceModule,
    IdentityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
