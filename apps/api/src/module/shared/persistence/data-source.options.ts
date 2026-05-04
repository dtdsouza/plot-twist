import { type DataSourceOptions } from 'typeorm'
import { envSchema } from '../config/env.schema'
import { databaseConfig } from '../config/segment/database.config'

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
