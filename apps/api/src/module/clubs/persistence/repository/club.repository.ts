import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@module/shared/persistence'
import { ClubEntity } from '../entity/club.entity'
import { MembershipEntity } from '../entity/membership.entity'
import { EMembershipRole } from '../enum/membership-role.enum'

@Injectable()
export class ClubRepository extends BaseRepository<ClubEntity> {
  constructor(
    @InjectRepository(ClubEntity)
    repository: Repository<ClubEntity>,
  ) {
    super(repository)
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id)
  }

  async listForMember(
    userId: string,
  ): Promise<{ club: ClubEntity; role: EMembershipRole }[]> {
    const rows = await this.repository
      .createQueryBuilder('c')
      .innerJoin(
        MembershipEntity,
        'm',
        'm."clubId" = c.id AND m."userId" = :userId',
        { userId },
      )
      .addSelect('m.role', 'role')
      .orderBy('c."createdAt"', 'DESC')
      .getRawAndEntities()

    return rows.entities.map((club, i) => ({
      club,
      role: rows.raw[i].role as EMembershipRole,
    }))
  }
}
