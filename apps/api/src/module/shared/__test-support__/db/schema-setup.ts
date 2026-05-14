import { getTestPool } from './pool'

export async function ensureIdentitySchema(): Promise<void> {
  const pool = getTestPool()
  await pool.query('CREATE SCHEMA IF NOT EXISTS identity')
}
