import { type DataSourceOptions } from 'typeorm'
import { envSchema, databaseConfig } from '@module/shared/config'

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
