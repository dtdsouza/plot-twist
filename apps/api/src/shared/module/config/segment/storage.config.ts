import { registerAs } from '@nestjs/config'

export const STORAGE_CONFIG_KEY = 'storage' as const

export interface IStorageConfig {
  readonly region: string
  readonly endpoint: string | null
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly avatarsBucket: string
  readonly publicUrlBase: string | null
  readonly maxAvatarSizeBytes: number
  readonly maxAvatarDimension: number
  readonly avatarAllowedMime: ReadonlyArray<string>
  readonly presignedPostTtlSeconds: number
}

export const storageConfig = registerAs(STORAGE_CONFIG_KEY, (): IStorageConfig => {
  const endpoint = process.env.S3_ENDPOINT
  const publicUrlBase = process.env.S3_PUBLIC_URL_BASE

  return Object.freeze({
    region: process.env.S3_REGION as string,
    endpoint: endpoint && endpoint.length > 0 ? endpoint : null,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    avatarsBucket: process.env.S3_BUCKET_AVATARS as string,
    publicUrlBase:
      publicUrlBase && publicUrlBase.length > 0 ? publicUrlBase : null,
    maxAvatarSizeBytes: Number(process.env.MAX_AVATAR_SIZE_BYTES),
    maxAvatarDimension: Number(process.env.MAX_AVATAR_DIMENSION),
    avatarAllowedMime: Object.freeze(
      (process.env.AVATAR_ALLOWED_MIME as string)
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0),
    ),
    presignedPostTtlSeconds: Number(process.env.PRESIGNED_POST_TTL_SECONDS),
  })
})
