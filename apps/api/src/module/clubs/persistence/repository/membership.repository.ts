import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@module/shared/persistence'
import { MembershipEntity } from '../entity/membership.entity'
import { EMembershipRole } from '../enum/membership-role.enum'

@Injectable()
export class MembershipRepository extends BaseRepository<MembershipEntity> {
  constructor(
    @InjectRepository(MembershipEntity)
    repository: Repository<MembershipEntity>,
  ) {
    super(repository)
  }

  async existsOwnership(clubId: string, userId: string): Promise<boolean> {
    const row = await this.repository.findOne({
      where: { clubId, userId, role: EMembershipRole.OWNER },
    })
    return row !== null
  }

  async findRoleForUser(
    clubId: string,
    userId: string,
  ): Promise<EMembershipRole | null> {
    const row = await this.repository.findOne({ where: { clubId, userId } })
    return row ? row.role : null
  }

  async listClubIdsForUser(
    userId: string,
  ): Promise<{ clubId: string; role: EMembershipRole }[]> {
    const rows = await this.repository.find({ where: { userId } })
    return rows.map((r) => ({ clubId: r.clubId, role: r.role }))
  }
}
