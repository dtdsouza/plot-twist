import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '@module/shared/auth'
import { MailModule } from '@module/shared/mail'
import { StorageModule } from '@module/shared/storage'
import { ClubEntity } from './persistence/entity/club.entity'
import { MembershipEntity } from './persistence/entity/membership.entity'
import { ClubInviteEntity } from './persistence/entity/club-invite.entity'
import { ClubRepository } from './persistence/repository/club.repository'
import { MembershipRepository } from './persistence/repository/membership.repository'
import { ClubInviteRepository } from './persistence/repository/club-invite.repository'
import { ClubService } from './core/club.service'
import { ClubCoverService } from './core/club-cover.service'
import { ClubInviteService } from './core/club-invite.service'
import { ClubsController } from './http/controller/clubs.controller'
import { ClubInviteController } from './http/controller/club-invite.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClubEntity, MembershipEntity, ClubInviteEntity]),
    AuthModule,
    MailModule,
    StorageModule,
    ConfigModule,
  ],
  controllers: [ClubsController, ClubInviteController],
  providers: [
    ClubRepository,
    MembershipRepository,
    ClubInviteRepository,
    ClubService,
    ClubCoverService,
    ClubInviteService,
  ],
  exports: [],
})
export class ClubsModule {}
