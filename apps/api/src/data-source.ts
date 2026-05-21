import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { buildDataSourceOptions } from '@module/shared/persistence'
import { UserEntity } from './module/identity/persistence/entity/user.entity'
import { PasswordResetTokenEntity } from './module/identity/persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from './module/identity/persistence/entity/email-change-token.entity'
import { ClubEntity } from './module/clubs/persistence/entity/club.entity'
import { MembershipEntity } from './module/clubs/persistence/entity/membership.entity'

export const AppDataSource = new DataSource(
  buildDataSourceOptions({
    entities: [
      UserEntity,
      PasswordResetTokenEntity,
      EmailChangeTokenEntity,
      ClubEntity,
      MembershipEntity,
    ],
    migrations: [
      'src/module/identity/migrations/*.ts',
      'src/module/clubs/migrations/*.ts',
    ],
    subscribers: [],
  }),
)
