import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./http/controller/auth.controller";
import { UserController } from "./http/controller/user.controller";
import { AuthService } from "./core/auth.service";
import { UserService } from "./core/user.service";
import { EmailChangeService } from "./core/email-change.service";
import { UserEntity } from "./persistence/entity/user.entity";
import { PasswordResetTokenEntity } from "./persistence/entity/password-reset-token.entity";
import { EmailChangeTokenEntity } from "./persistence/entity/email-change-token.entity";
import { UserRepository } from "./persistence/repository/user.repository";
import { PasswordResetTokenRepository } from "./persistence/repository/password-reset-token.repository";
import { EmailChangeTokenRepository } from "./persistence/repository/email-change-token.repository";
import { AuthModule } from "@module/shared/auth";
import { MailModule } from "@module/shared/mail";
import { StorageModule } from "@module/shared/storage";
import { AvatarService } from "./core/avatar.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      PasswordResetTokenEntity,
      EmailChangeTokenEntity,
    ]),
    AuthModule,
    MailModule,
    StorageModule,
  ],
  controllers: [AuthController, UserController],
  providers: [
    AuthService,
    UserService,
    EmailChangeService,
    AvatarService,
    UserRepository,
    PasswordResetTokenRepository,
    EmailChangeTokenRepository,
  ],
  exports: [],
})
export class IdentityModule {}
