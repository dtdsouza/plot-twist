import { randomBytes } from 'node:crypto'
import { getTestPool } from '@module/shared/test-support'

export interface ClubInviteRow {
  id: string
  clubId: string
  token: string
  createdByUserId: string
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateClubInviteInput {
  clubId: string
  createdByUserId: string
  token?: string
  expiresAt?: Date | null
  revokedAt?: Date | null
}

export async function createClubInvite(
  input: CreateClubInviteInput,
): Promise<ClubInviteRow> {
  const token = input.token ?? randomBytes(32).toString('base64url')
  const expiresAt =
    input.expiresAt !== undefined
      ? input.expiresAt
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const revokedAt = input.revokedAt !== undefined ? input.revokedAt : null

  const pool = getTestPool()
  const { rows } = await pool.query<ClubInviteRow>(
    `INSERT INTO clubs."club_invite"
       ("clubId", token, "createdByUserId", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, "clubId", token, "createdByUserId", "expiresAt", "revokedAt", "createdAt", "updatedAt"`,
    [input.clubId, token, input.createdByUserId, expiresAt, revokedAt],
  )
  return rows[0]
}
