export interface IPresignedPostOptions {
  readonly bucket: string
  readonly key: string
  readonly maxContentLength: number
  readonly contentTypePrefix: string
  readonly expiresInSeconds: number
}
