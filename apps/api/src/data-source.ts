import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { buildDataSourceOptions } from '@module/shared/persistence'
import { UserEntity, PasswordResetTokenEntity } from '@module/identity'

export const AppDataSource = new DataSource(
  buildDataSourceOptions({
    entities: [UserEntity, PasswordResetTokenEntity],
    migrations: ['src/module/identity/migrations/*.ts'],
    subscribers: [],
  }),
)
