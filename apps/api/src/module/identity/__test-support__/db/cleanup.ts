import { truncateTables } from '@module/shared/test-support'
import { IDENTITY_SCHEMA, IDENTITY_TABLES } from './identity-entities'

export function truncateIdentity(): Promise<void> {
  return truncateTables(IDENTITY_SCHEMA, IDENTITY_TABLES)
}
