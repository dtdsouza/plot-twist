import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ClubEntity } from '../persistence/entity/club.entity'
import { MembershipEntity } from '../persistence/entity/membership.entity'
import { EMembershipRole } from '../persistence/enum/membership-role.enum'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import type { CreateClubDto } from '../http/dto/create-club.dto'
import type { UpdateClubDto } from '../http/dto/update-club.dto'

@Injectable()
export class ClubService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly clubRepository: ClubRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async create(
    ownerId: string,
    dto: CreateClubDto,
  ): Promise<ClubEntity> {
    const club = await this.dataSource.transaction(async (manager) => {
      const newClub = manager.create(ClubEntity, {
        name: dto.name,
        description: dto.description ?? null,
        ownerId,
      })
      await manager.save(newClub)

      const membership = manager.create(MembershipEntity, {
        clubId: newClub.id,
        userId: ownerId,
        role: EMembershipRole.OWNER,
        joinedAt: new Date(),
      })
      await manager.save(membership)

      return newClub
    })

    // TODO(events): emit ClubCreated + MemberJoined here once the event bus is introduced.
    // Deferred per design.md D6 + Non-Goals; will land alongside the first consumer (Discussions).

    return club
  }

  async listForMember(
    userId: string,
  ): Promise<{ club: ClubEntity; role: EMembershipRole }[]> {
    return this.clubRepository.listForMember(userId)
  }

  async findByIdForMember(
    clubId: string,
    userId: string,
  ): Promise<{ club: ClubEntity; role: EMembershipRole }> {
    const role = await this.membershipRepository.findRoleForUser(clubId, userId)
    if (role === null) {
      throw new NotFoundException('Club not found')
    }

    const club = await this.clubRepository.findOne({ id: clubId })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    return { club, role }
  }

  async updateAsOwner(
    clubId: string,
    userId: string,
    dto: UpdateClubDto,
  ): Promise<ClubEntity> {
    const club = await this.clubRepository.findOne({ id: clubId })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    const isOwner = await this.membershipRepository.existsOwnership(clubId, userId)
    if (!isOwner) {
      throw new ForbiddenException('Only the club owner can perform this action')
    }

    const patch: Partial<Pick<ClubEntity, 'name' | 'description'>> = {}
    if (dto.name !== undefined) patch.name = dto.name
    if (dto.description !== undefined) patch.description = dto.description

    if (Object.keys(patch).length === 0) {
      return club
    }

    return this.clubRepository.update(clubId, patch)
  }

  async deleteAsOwner(clubId: string, userId: string): Promise<void> {
    const club = await this.clubRepository.findOne({ id: clubId })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    const isOwner = await this.membershipRepository.existsOwnership(clubId, userId)
    if (!isOwner) {
      throw new ForbiddenException('Only the club owner can perform this action')
    }

    await this.clubRepository.delete(clubId)
  }
}
