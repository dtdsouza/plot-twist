import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './http/controller/auth.controller'
import { AuthService } from './core/auth.service'
import { UserEntity } from './persistence/entity/user.entity'
import { PasswordResetTokenEntity } from './persistence/entity/password-reset-token.entity'
import { UserRepository } from './persistence/repository/user.repository'
import { PasswordResetTokenRepository } from './persistence/repository/password-reset-token.repository'
import { type IJwtConfig } from '../../infra/config'
import { MailModule } from '../../infra/mail'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PasswordResetTokenEntity]),
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
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, UserRepository, PasswordResetTokenRepository],
  exports: [AuthService],
})
export class IdentityModule {}
