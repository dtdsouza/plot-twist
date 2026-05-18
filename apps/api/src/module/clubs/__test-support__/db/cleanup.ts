import { truncateTables } from '@module/shared/test-support'
import { CLUBS_SCHEMA, CLUBS_TABLES } from './clubs-entities'

export function truncateClubs(): Promise<void> {
  return truncateTables(CLUBS_SCHEMA, CLUBS_TABLES)
}
