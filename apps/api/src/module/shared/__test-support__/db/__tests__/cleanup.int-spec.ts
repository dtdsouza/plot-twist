import {
  closeTestPool,
  ensureIdentitySchema,
  getTestPool,
  truncateIdentity,
} from '@module/shared/test-support'

const CREATE_USER_TABLE = `
  CREATE TABLE IF NOT EXISTS identity."user" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE NOT NULL,
    "passwordHash" varchar(255) NOT NULL,
    "displayName" varchar(100) NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`

const CREATE_PASSWORD_RESET_TOKEN_TABLE = `
  CREATE TABLE IF NOT EXISTS identity."password_reset_token" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    "tokenHash" varchar(64) NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`

const CREATE_EMAIL_CHANGE_TOKEN_TABLE = `
  CREATE TABLE IF NOT EXISTS identity."email_change_token" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
    "tokenHash" varchar(64) NOT NULL,
    "newEmail" varchar(255) NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )
`

describe('shared test-support (integration)', () => {
  beforeAll(async () => {
    await ensureIdentitySchema()
    const pool = getTestPool()
    await pool.query(CREATE_USER_TABLE)
    await pool.query(CREATE_PASSWORD_RESET_TOKEN_TABLE)
    await pool.query(CREATE_EMAIL_CHANGE_TOKEN_TABLE)
  })

  afterAll(async () => {
    await closeTestPool()
  })

  describe('ensureIdentitySchema', () => {
    it('is idempotent — running twice does not throw', async () => {
      await ensureIdentitySchema()
      await ensureIdentitySchema()
    })
  })

  describe('truncateIdentity', () => {
    beforeEach(async () => {
      await truncateIdentity()
    })

    it('removes rows previously inserted into identity tables', async () => {
      const pool = getTestPool()
      await pool.query(
        `INSERT INTO identity."user" (email, "passwordHash", "displayName") VALUES ($1, $2, $3)`,
        ['cleanup@smoke.test', 'hash', 'Smoke User'],
      )

      await truncateIdentity()

      const { rows } = await pool.query(`SELECT count(*)::int AS count FROM identity."user"`)
      expect(rows[0].count).toBe(0)
    })

    it('truncates user with cascading token rows (FK cascade)', async () => {
      const pool = getTestPool()
      const { rows: userRows } = await pool.query(
        `INSERT INTO identity."user" (email, "passwordHash", "displayName") VALUES ($1, $2, $3) RETURNING id`,
        ['cascade@smoke.test', 'hash', 'Cascade User'],
      )
      const userId = userRows[0].id as string
      await pool.query(
        `INSERT INTO identity."password_reset_token" ("userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3)`,
        [userId, 'a'.repeat(64), new Date(Date.now() + 3_600_000)],
      )

      await truncateIdentity()

      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM identity."password_reset_token"`,
      )
      expect(rows[0].count).toBe(0)
    })

    it('does not throw when all tables are already empty', async () => {
      await truncateIdentity()
      await truncateIdentity()
    })
  })
})
