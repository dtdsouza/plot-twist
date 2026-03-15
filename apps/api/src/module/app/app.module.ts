import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { ConfigModule } from '../../infra/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { IdentityModule } from '../identity/identity.module'
import { type IDatabaseConfig } from '../../infra/config'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<IDatabaseConfig>('database')

        return {
          type: db.type,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          synchronize: db.synchronize,
          logging: db.logging,
          autoLoadEntities: true,
        }
      },
    }),
    IdentityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
