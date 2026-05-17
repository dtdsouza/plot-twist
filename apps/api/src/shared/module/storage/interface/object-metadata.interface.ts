export interface IObjectMetadata {
  readonly contentType: string | null
  readonly contentLength: number
  readonly etag: string | null
}
