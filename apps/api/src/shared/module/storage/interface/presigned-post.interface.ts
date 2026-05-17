export interface IPresignedPost {
  readonly url: string
  readonly fields: Readonly<Record<string, string>>
  readonly key: string
  readonly expiresAt: Date
}
