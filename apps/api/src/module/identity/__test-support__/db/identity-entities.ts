import { UserEntity } from '../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from '../../persistence/entity/email-change-token.entity'

export const IDENTITY_SCHEMA = 'identity'

// Mirrors @Entity({ name }) on the identity entities. Used by truncateIdentity().
// A drift between this list and the actual table set will fail loudly in the
// factory int-specs (truncate hits a non-existent table or leaves rows behind).
export const IDENTITY_TABLES = [
  'email_change_token',
  'password_reset_token',
  'user',
] as const

// Every identity int/e2e spec must sync this full set. `truncateIdentity()`
// targets all three tables; a partial sync leaves the spec dependent on
// another worker having created the missing tables — which no longer happens
// with per-worker databases.
export const IDENTITY_TEST_ENTITIES = [
  UserEntity,
  PasswordResetTokenEntity,
  EmailChangeTokenEntity,
] as const
