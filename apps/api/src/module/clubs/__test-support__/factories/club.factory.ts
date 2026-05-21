import { randomUUID } from 'node:crypto'
import { getTestPool } from '@module/shared/test-support'

export interface ClubRow {
  id: string
  name: string
  description: string | null
  ownerId: string
  coverImageUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateClubInput {
  ownerId: string
  name?: string
  description?: string | null
  coverImageUrl?: string | null
}

export async function createClub(input: CreateClubInput): Promise<ClubRow> {
  const name = input.name ?? `Factory Club ${randomUUID().slice(0, 8)}`
  const description = input.description ?? null
  const coverImageUrl = input.coverImageUrl ?? null

  const pool = getTestPool()
  const { rows } = await pool.query<ClubRow>(
    `INSERT INTO clubs."club"
       (name, description, "ownerId", "coverImageUrl")
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, "ownerId", "coverImageUrl", "createdAt", "updatedAt"`,
    [name, description, input.ownerId, coverImageUrl],
  )
  return rows[0]
}
