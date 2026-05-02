import { type DataSourceOptions } from 'typeorm'
import { envSchema } from '../infra/config/env.schema'
import { databaseConfig } from '../infra/config/segment/database.config'

export function buildDataSourceOptions(
  overrides?: Partial<DataSourceOptions>,
): DataSourceOptions {
  envSchema.parse(process.env)
  const db = databaseConfig()

  return {
    ...db,
    ...overrides,
  } as DataSourceOptions
}
