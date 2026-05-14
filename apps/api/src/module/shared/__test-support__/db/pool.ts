import { Pool, type PoolConfig } from 'pg'

let pool: Pool | null = null

function buildConfig(): PoolConfig {
  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'plot-twist',
    max: 4,
  }
}

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool(buildConfig())
  }
  return pool
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    const current = pool
    pool = null
    await current.end()
  }
}
