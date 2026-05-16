import { ensureSchema } from '@module/shared/test-support'
import { IDENTITY_SCHEMA } from './identity-entities'

export function ensureIdentitySchema(): Promise<void> {
  return ensureSchema(IDENTITY_SCHEMA)
}
