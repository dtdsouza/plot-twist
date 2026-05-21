export interface IClubCoverUploadIntentResponse {
  readonly url: string
  readonly fields: Readonly<Record<string, string>>
  readonly key: string
  readonly expiresAt: string
  readonly limits: {
    readonly maxContentLength: number
    readonly maxDimension: number
    readonly allowedMime: ReadonlyArray<string>
  }
}
