import { ClubEntity } from '../../persistence/entity/club.entity'
import { MembershipEntity } from '../../persistence/entity/membership.entity'

export const CLUBS_SCHEMA = 'clubs'

// Mirrors @Entity({ name }) on the clubs entities. Used by truncateClubs().
// Order matters for truncate: children (membership) before parents (club) to
// respect the FK constraint. A drift between this list and the actual table
// set will fail loudly in the factory int-specs.
export const CLUBS_TABLES = ['membership', 'club'] as const

// Every clubs int/e2e spec must sync this full set. A partial sync leaves the
// spec dependent on another worker having created the missing tables — which
// no longer happens with per-worker databases.
export const CLUBS_TEST_ENTITIES = [ClubEntity, MembershipEntity] as const
