import { ensureSchema } from '@module/shared/test-support'
import { CLUBS_SCHEMA } from './clubs-entities'

export function ensureClubsSchema(): Promise<void> {
  return ensureSchema(CLUBS_SCHEMA)
}
