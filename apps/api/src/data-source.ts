import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { buildDataSourceOptions } from './module/shared/persistence'
import { UserEntity } from './module/identity/persistence/entity/user.entity'
import { PasswordResetTokenEntity } from './module/identity/persistence/entity/password-reset-token.entity'

export const AppDataSource = new DataSource(
  buildDataSourceOptions({
    entities: [UserEntity, PasswordResetTokenEntity],
    migrations: ['src/module/identity/migrations/*.ts'],
    subscribers: [],
  }),
)
