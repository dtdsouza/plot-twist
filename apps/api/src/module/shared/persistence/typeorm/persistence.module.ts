import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import {
  DATABASE_CONFIG_KEY,
  type IDatabaseConfig,
} from '@module/shared/config'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<IDatabaseConfig>(DATABASE_CONFIG_KEY)

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
  ],
})
export class PersistenceModule {}
