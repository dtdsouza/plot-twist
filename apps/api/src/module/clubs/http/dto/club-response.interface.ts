import type { EMembershipRole } from '../../persistence/enum/membership-role.enum'

export interface IClubResponse {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly ownerId: string
  readonly coverImageUrl: string | null
  readonly role: EMembershipRole | null
  readonly createdAt: string
  readonly updatedAt: string
}
