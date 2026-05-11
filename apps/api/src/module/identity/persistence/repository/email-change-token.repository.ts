import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, MoreThan, type FindOptionsWhere } from 'typeorm'
import { BaseRepository } from '@module/shared/typeorm'
import { EmailChangeTokenEntity } from '../entity/email-change-token.entity'

@Injectable()
export class EmailChangeTokenRepository extends BaseRepository<EmailChangeTokenEntity> {
  constructor(
    @InjectRepository(EmailChangeTokenEntity)
    repository: Repository<EmailChangeTokenEntity>,
  ) {
    super(repository)
  }

  async findValidByTokenHash(
    tokenHash: string,
  ): Promise<EmailChangeTokenEntity | null> {
    const entity = await this.repository.findOne({
      where: { tokenHash, expiresAt: MoreThan(new Date()) },
    })
    return entity ? ({ ...entity } as EmailChangeTokenEntity) : null
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const where: FindOptionsWhere<EmailChangeTokenEntity> = { userId }
    await this.repository.delete(where)
  }
}
