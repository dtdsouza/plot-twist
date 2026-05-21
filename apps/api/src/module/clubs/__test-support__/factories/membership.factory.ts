import { getTestPool } from '@module/shared/test-support'

export interface MembershipRow {
  id: string
  clubId: string
  userId: string
  role: string
  joinedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateMembershipInput {
  clubId: string
  userId: string
  role?: string
  joinedAt?: Date
}

export async function createMembership(
  input: CreateMembershipInput,
): Promise<MembershipRow> {
  const role = input.role ?? 'owner'
  const joinedAt = input.joinedAt ?? new Date()

  const pool = getTestPool()
  const { rows } = await pool.query<MembershipRow>(
    `INSERT INTO clubs."membership"
       ("clubId", "userId", role, "joinedAt")
     VALUES ($1, $2, $3, $4)
     RETURNING id, "clubId", "userId", role, "joinedAt", "createdAt", "updatedAt"`,
    [input.clubId, input.userId, role, joinedAt],
  )
  return rows[0]
}
