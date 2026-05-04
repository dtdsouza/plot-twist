import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, MoreThan, type FindOptionsWhere } from 'typeorm'
import { BaseRepository } from '../../../shared/typeorm'
import { PasswordResetTokenEntity } from '../entity/password-reset-token.entity'

@Injectable()
export class PasswordResetTokenRepository extends BaseRepository<PasswordResetTokenEntity> {
  constructor(
    @InjectRepository(PasswordResetTokenEntity)
    repository: Repository<PasswordResetTokenEntity>,
  ) {
    super(repository)
  }

  async findValidByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenEntity | null> {
    const entity = await this.repository.findOne({
      where: { tokenHash, expiresAt: MoreThan(new Date()) },
    })
    return entity ? ({ ...entity } as PasswordResetTokenEntity) : null
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const where: FindOptionsWhere<PasswordResetTokenEntity> = { userId }
    await this.repository.delete(where)
  }
}
