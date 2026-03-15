import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './http/controller/auth.controller'
import { AuthService } from './core/auth.service'
import { UserEntity } from './persistence/entity/user.entity'
import { type IJwtConfig } from '../../infra/config'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = config.getOrThrow<IJwtConfig>('jwt')

        return {
          secret: jwt.secret,
          signOptions: { expiresIn: jwt.expiresIn },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class IdentityModule {}
