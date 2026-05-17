import { ensureWorkerDatabase } from './database-setup'
import { getTestPool } from './pool'

const VALID_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function ensureSchema(name: string): Promise<void> {
  if (!VALID_IDENT.test(name)) {
    throw new Error(`Refusing to CREATE SCHEMA with unsafe name: ${name}`)
  }
  await ensureWorkerDatabase()
  const pool = getTestPool()
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${name}"`)
}
