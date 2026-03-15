import { EUserStatus } from '../enum/user-status.enum'

export interface IUser {
  readonly id: string
  readonly email: string
  readonly passwordHash: string
  readonly displayName: string
  readonly avatar: string | null
  readonly bio: string | null
  readonly status: EUserStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}
