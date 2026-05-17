import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { WinstonModule, WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { LOGGING_CONFIG_KEY, type ILoggingConfig } from '@module/shared/config'
import { createWinstonOptions } from './factory/winston.factory'
import { HttpAccessMiddleware } from './middleware/http-access.middleware'
import { RequestIdMiddleware } from './middleware/request-id.middleware'

@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const loggingConfig = config.get<ILoggingConfig>(LOGGING_CONFIG_KEY)!
        return createWinstonOptions({
          level: loggingConfig.level,
          format: loggingConfig.format,
        })
      },
    }),
  ],
  providers: [RequestIdMiddleware, HttpAccessMiddleware],
  exports: [WINSTON_MODULE_NEST_PROVIDER, RequestIdMiddleware, HttpAccessMiddleware],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, HttpAccessMiddleware).forRoutes('*')
  }
}
