import { randomUUID } from 'node:crypto'
import * as bcrypt from 'bcryptjs'
import { getTestPool } from '@module/shared/test-support'

export const TEST_DEFAULT_PASSWORD = 'password123'
const BCRYPT_COST = 12
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(TEST_DEFAULT_PASSWORD, BCRYPT_COST)

export interface UserRow {
  id: string
  email: string
  passwordHash: string
  displayName: string
  avatar: string | null
  bio: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  email?: string
  plainPassword?: string
  passwordHash?: string
  displayName?: string
  avatar?: string | null
  bio?: string | null
  status?: string
}

function resolvePasswordHash(input: CreateUserInput): string {
  if (input.passwordHash) return input.passwordHash
  if (input.plainPassword) return bcrypt.hashSync(input.plainPassword, BCRYPT_COST)
  return DEFAULT_PASSWORD_HASH
}

export async function createUser(input: CreateUserInput = {}): Promise<UserRow> {
  const email = input.email ?? `user-${randomUUID()}@factory.test`
  const passwordHash = resolvePasswordHash(input)
  const displayName = input.displayName ?? `Factory User ${randomUUID().slice(0, 8)}`
  const avatar = input.avatar ?? null
  const bio = input.bio ?? null
  const status = input.status ?? 'active'

  const pool = getTestPool()
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO identity."user"
       (email, "passwordHash", "displayName", avatar, bio, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, "passwordHash", "displayName", avatar, bio, status, "createdAt", "updatedAt"`,
    [email, passwordHash, displayName, avatar, bio, status],
  )
  return rows[0]
}
