import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './http/controller/auth.controller'
import { UserController } from './http/controller/user.controller'
import { AuthService } from './core/auth.service'
import { UserService } from './core/user.service'
import { JwtAuthGuard } from './http/guard/jwt-auth.guard'
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
  controllers: [AuthController, UserController],
  providers: [
    AuthService,
    UserService,
    JwtAuthGuard,
    UserRepository,
    PasswordResetTokenRepository,
  ],
  exports: [AuthService, UserService],
})
export class IdentityModule {}
