import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt'
import { type IJwtConfig } from '@module/shared/config'
import { JwtAuthGuard } from './guard/jwt-auth.guard'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = config.getOrThrow<IJwtConfig>('jwt')

        return {
          secret: jwt.secret,
          signOptions: { expiresIn: jwt.expiresIn },
        } as JwtModuleOptions
      },
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
