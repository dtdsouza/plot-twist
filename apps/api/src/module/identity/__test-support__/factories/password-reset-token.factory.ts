import { randomBytes } from 'node:crypto'
import { getTestPool } from '@module/shared/test-support'

export interface PasswordResetTokenRow {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreatePasswordResetTokenInput {
  userId: string
  tokenHash?: string
  expiresAt?: Date
}

export async function createPasswordResetToken(
  input: CreatePasswordResetTokenInput,
): Promise<PasswordResetTokenRow> {
  const tokenHash = input.tokenHash ?? randomBytes(32).toString('hex')
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 3_600_000)

  const pool = getTestPool()
  const { rows } = await pool.query<PasswordResetTokenRow>(
    `INSERT INTO identity."password_reset_token"
       ("userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3)
     RETURNING id, "userId", "tokenHash", "expiresAt", "createdAt", "updatedAt"`,
    [input.userId, tokenHash, expiresAt],
  )
  return rows[0]
}
