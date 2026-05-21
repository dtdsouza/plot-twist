import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '@module/shared/auth'
import { StorageModule } from '@module/shared/storage'
import { ClubEntity } from './persistence/entity/club.entity'
import { MembershipEntity } from './persistence/entity/membership.entity'
import { ClubRepository } from './persistence/repository/club.repository'
import { MembershipRepository } from './persistence/repository/membership.repository'
import { ClubService } from './core/club.service'
import { ClubCoverService } from './core/club-cover.service'
import { ClubsController } from './http/controller/clubs.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClubEntity, MembershipEntity]),
    AuthModule,
    StorageModule,
    ConfigModule,
  ],
  controllers: [ClubsController],
  providers: [
    ClubRepository,
    MembershipRepository,
    ClubService,
    ClubCoverService,
  ],
  exports: [],
})
export class ClubsModule {}
