import { randomBytes } from 'node:crypto'
import { getTestPool } from '@module/shared/test-support'

export interface EmailChangeTokenRow {
  id: string
  userId: string
  tokenHash: string
  newEmail: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateEmailChangeTokenInput {
  userId: string
  newEmail: string
  tokenHash?: string
  expiresAt?: Date
}

export async function createEmailChangeToken(
  input: CreateEmailChangeTokenInput,
): Promise<EmailChangeTokenRow> {
  const tokenHash = input.tokenHash ?? randomBytes(32).toString('hex')
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 3_600_000)

  const pool = getTestPool()
  const { rows } = await pool.query<EmailChangeTokenRow>(
    `INSERT INTO identity."email_change_token"
       ("userId", "tokenHash", "newEmail", "expiresAt")
     VALUES ($1, $2, $3, $4)
     RETURNING id, "userId", "tokenHash", "newEmail", "expiresAt", "createdAt", "updatedAt"`,
    [input.userId, tokenHash, input.newEmail, expiresAt],
  )
  return rows[0]
}
