import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ConfigModule } from '../shared/config'
import { PersistenceModule } from '../shared/persistence'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { IdentityModule } from '../identity/identity.module'

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
