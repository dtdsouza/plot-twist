import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { buildDataSourceOptions } from '@module/shared/persistence'
import {
  UserEntity,
  PasswordResetTokenEntity,
  EmailChangeTokenEntity,
} from '@module/identity'

export const AppDataSource = new DataSource(
  buildDataSourceOptions({
    entities: [UserEntity, PasswordResetTokenEntity, EmailChangeTokenEntity],
    migrations: ['src/module/identity/migrations/*.ts'],
    subscribers: [],
  }),
)
