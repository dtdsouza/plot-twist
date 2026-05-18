import type { ClubEntity } from '../../persistence/entity/club.entity'
import type { EMembershipRole } from '../../persistence/enum/membership-role.enum'
import type { IClubResponse } from './club-response.interface'

export function toClubResponse(
  club: ClubEntity,
  role: EMembershipRole | null = null,
): IClubResponse {
  return Object.freeze({
    id: club.id,
    name: club.name,
    description: club.description,
    ownerId: club.ownerId,
    coverImageUrl: club.coverImageUrl,
    role,
    createdAt: club.createdAt.toISOString(),
    updatedAt: club.updatedAt.toISOString(),
  })
}
