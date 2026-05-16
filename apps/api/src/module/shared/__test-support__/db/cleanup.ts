import { getTestPool } from './pool'

const VALID_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function truncateTables(
  schema: string,
  tables: readonly string[],
): Promise<void> {
  if (tables.length === 0) return
  if (!VALID_IDENT.test(schema)) {
    throw new Error(`Refusing to truncate unsafe schema: ${schema}`)
  }
  for (const table of tables) {
    if (!VALID_IDENT.test(table)) {
      throw new Error(`Refusing to truncate unsafe table: ${table}`)
    }
  }
  const qualified = tables.map((t) => `"${schema}"."${t}"`).join(', ')
  const pool = getTestPool()
  await pool.query(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`)
}
