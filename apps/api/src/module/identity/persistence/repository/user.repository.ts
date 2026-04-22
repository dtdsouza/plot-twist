import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, QueryFailedError, type DeepPartial } from 'typeorm'
import { BaseRepository } from '../../../../infra/typeorm'
import { UserEntity } from '../entity/user.entity'

const PG_UNIQUE_VIOLATION = '23505'

@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  constructor(
    @InjectRepository(UserEntity)
    repository: Repository<UserEntity>,
  ) {
    super(repository)
  }

  override async create(data: DeepPartial<UserEntity>): Promise<UserEntity> {
    try {
      return await super.create(data)
    } catch (error) {
      if (this.isUniqueEmailViolation(error)) {
        throw new ConflictException('A user with this email already exists')
      }
      throw error
    }
  }

  private isUniqueEmailViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false
    }
    const err = error as QueryFailedError & {
      code?: string
      driverError?: { code?: string }
    }
    const code = err.code ?? err.driverError?.code
    return code === PG_UNIQUE_VIOLATION
  }
}
