import { getTestPool } from './pool'

export async function truncateIdentity(): Promise<void> {
  const pool = getTestPool()
  await pool.query(
    `TRUNCATE TABLE identity."email_change_token", identity."password_reset_token", identity."user" RESTART IDENTITY CASCADE`,
  )
}
