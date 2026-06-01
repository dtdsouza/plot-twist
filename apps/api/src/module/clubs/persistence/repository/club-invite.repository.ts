import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager, DeepPartial } from 'typeorm'
import { BaseRepository } from '@module/shared/persistence'
import { ClubInviteEntity } from '../entity/club-invite.entity'

@Injectable()
export class ClubInviteRepository extends BaseRepository<ClubInviteEntity> {
  constructor(
    @InjectRepository(ClubInviteEntity)
    repository: Repository<ClubInviteEntity>,
  ) {
    super(repository)
  }

  async findActiveByClub(clubId: string): Promise<ClubInviteEntity | null> {
    const now = new Date()
    const entity = await this.repository
      .createQueryBuilder('ci')
      .where('ci."clubId" = :clubId', { clubId })
      .andWhere(this.activeCondition())
      .setParameter('now', now)
      .getOne()
    return entity ? ({ ...entity } as ClubInviteEntity) : null
  }

  async findActiveByToken(token: string): Promise<ClubInviteEntity | null> {
    const now = new Date()
    const entity = await this.repository
      .createQueryBuilder('ci')
      .where('ci."token" = :token', { token })
      .andWhere(this.activeCondition())
      .setParameter('now', now)
      .getOne()
    return entity ? ({ ...entity } as ClubInviteEntity) : null
  }

  async revokeActiveForClub(manager: EntityManager, clubId: string): Promise<void> {
    const now = new Date()
    await manager
      .createQueryBuilder()
      .update(ClubInviteEntity)
      .set({ revokedAt: now })
      .where('"clubId" = :clubId', { clubId })
      .andWhere('"revokedAt" IS NULL')
      .andWhere('("expiresAt" IS NULL OR "expiresAt" > :now)', { now })
      .execute()
  }

  async insert(data: DeepPartial<ClubInviteEntity>): Promise<ClubInviteEntity> {
    return this.create(data)
  }

  // Returns the SQL fragment for an "active" invite:
  // not revoked AND (no expiry OR expiry is in the future).
  private activeCondition(): string {
    return 'ci."revokedAt" IS NULL AND (ci."expiresAt" IS NULL OR ci."expiresAt" > :now)'
  }
}
