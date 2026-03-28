export interface IPasswordResetToken {
  readonly id: string
  readonly tokenHash: string
  readonly userId: string
  readonly expiresAt: Date
  readonly createdAt: Date
}
