import { Client } from 'pg'

const VALID_DB_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/

export async function ensureWorkerDatabase(): Promise<void> {
  const targetDb = process.env.DB_NAME ?? 'plot-twist'
  const adminDb = process.env.DB_ADMIN_NAME ?? 'postgres'

  if (targetDb === adminDb) return
  if (!VALID_DB_NAME.test(targetDb)) {
    throw new Error(`Refusing to CREATE DATABASE with unsafe name: ${targetDb}`)
  }

  const client = new Client({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: adminDb,
  })

  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${targetDb}"`)
  } catch (err) {
    // 42P04 = duplicate_database — safe to ignore (concurrent worker won the race)
    if ((err as { code?: string }).code !== '42P04') throw err
  } finally {
    await client.end()
  }
}
