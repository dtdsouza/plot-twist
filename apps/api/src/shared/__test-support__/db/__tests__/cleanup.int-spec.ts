import {
  closeTestPool,
  ensureSchema,
  getTestPool,
  truncateTables,
} from '@module/shared/test-support'

const TEST_SCHEMA = 'shared_test_support_smoke'
const TABLE_PARENT = 'smoke_parent'
const TABLE_CHILD = 'smoke_child'

describe('shared test-support (integration)', () => {
  beforeAll(async () => {
    await ensureSchema(TEST_SCHEMA)
    const pool = getTestPool()
    await pool.query(
      `CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."${TABLE_PARENT}" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        label varchar(64) NOT NULL
      )`,
    )
    await pool.query(
      `CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."${TABLE_CHILD}" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parentId" uuid NOT NULL REFERENCES "${TEST_SCHEMA}"."${TABLE_PARENT}"(id) ON DELETE CASCADE
      )`,
    )
  })

  afterAll(async () => {
    const pool = getTestPool()
    await pool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
    await closeTestPool()
  })

  describe('ensureSchema', () => {
    it('is idempotent — running twice does not throw', async () => {
      await ensureSchema(TEST_SCHEMA)
      await ensureSchema(TEST_SCHEMA)
    })

    it('rejects unsafe schema names', async () => {
      await expect(ensureSchema('drop;--')).rejects.toThrow(/unsafe name/)
    })
  })

  describe('truncateTables', () => {
    beforeEach(async () => {
      await truncateTables(TEST_SCHEMA, [TABLE_CHILD, TABLE_PARENT])
    })

    it('removes rows from the listed tables', async () => {
      const pool = getTestPool()
      await pool.query(
        `INSERT INTO "${TEST_SCHEMA}"."${TABLE_PARENT}" (label) VALUES ($1)`,
        ['smoke-row'],
      )

      await truncateTables(TEST_SCHEMA, [TABLE_CHILD, TABLE_PARENT])

      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM "${TEST_SCHEMA}"."${TABLE_PARENT}"`,
      )
      expect(rows[0].count).toBe(0)
    })

    it('cascades through FK references when truncating the parent', async () => {
      const pool = getTestPool()
      const { rows: parentRows } = await pool.query(
        `INSERT INTO "${TEST_SCHEMA}"."${TABLE_PARENT}" (label) VALUES ($1) RETURNING id`,
        ['cascade-row'],
      )
      const parentId = parentRows[0].id as string
      await pool.query(
        `INSERT INTO "${TEST_SCHEMA}"."${TABLE_CHILD}" ("parentId") VALUES ($1)`,
        [parentId],
      )

      await truncateTables(TEST_SCHEMA, [TABLE_CHILD, TABLE_PARENT])

      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM "${TEST_SCHEMA}"."${TABLE_CHILD}"`,
      )
      expect(rows[0].count).toBe(0)
    })

    it('does not throw when all tables are already empty', async () => {
      await truncateTables(TEST_SCHEMA, [TABLE_CHILD, TABLE_PARENT])
      await truncateTables(TEST_SCHEMA, [TABLE_CHILD, TABLE_PARENT])
    })

    it('is a no-op when the table list is empty', async () => {
      await truncateTables(TEST_SCHEMA, [])
    })

    it('rejects unsafe schema or table names', async () => {
      await expect(
        truncateTables('bad;--', [TABLE_PARENT]),
      ).rejects.toThrow(/unsafe schema/)
      await expect(
        truncateTables(TEST_SCHEMA, ['bad;--']),
      ).rejects.toThrow(/unsafe table/)
    })
  })
})
