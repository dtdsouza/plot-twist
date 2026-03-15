import { registerAs } from '@nestjs/config'

export const DATABASE_CONFIG_KEY = 'database' as const

export interface IDatabaseConfig {
  readonly type: 'postgres'
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string
  readonly database: string
  readonly synchronize: boolean
  readonly logging: boolean
}

export const databaseConfig = registerAs(DATABASE_CONFIG_KEY, (): IDatabaseConfig => {
  return Object.freeze({
    type: 'postgres' as const,
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_NAME as string,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  })
})
