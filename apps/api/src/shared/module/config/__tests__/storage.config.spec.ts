import { storageConfig, STORAGE_CONFIG_KEY } from '../segment/storage.config'

describe('storageConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: 'http://localstack:4566',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      S3_BUCKET_AVATARS: 'plot-twist-avatars',
      S3_PUBLIC_URL_BASE: '',
      MAX_AVATAR_SIZE_BYTES: '2097152',
      MAX_AVATAR_DIMENSION: '2048',
      AVATAR_ALLOWED_MIME: 'image/jpeg, image/png ,image/webp',
      S3_BUCKET_CLUB_COVERS: 'plot-twist-club-covers',
      MAX_CLUB_COVER_SIZE_BYTES: '5242880',
      MAX_CLUB_COVER_DIMENSION: '4096',
      CLUB_COVER_ALLOWED_MIME: 'image/jpeg,image/png,image/webp',
      PRESIGNED_POST_TTL_SECONDS: '300',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('has the correct config key', () => {
    expect(STORAGE_CONFIG_KEY).toBe('storage')
  })

  it('returns a typed config from process.env', () => {
    const config = storageConfig()

    expect(config.region).toBe('us-east-1')
    expect(config.endpoint).toBe('http://localstack:4566')
    expect(config.accessKeyId).toBe('test')
    expect(config.secretAccessKey).toBe('test')
    expect(config.avatarsBucket).toBe('plot-twist-avatars')
    expect(config.publicUrlBase).toBeNull()
    expect(config.maxAvatarSizeBytes).toBe(2097152)
    expect(config.maxAvatarDimension).toBe(2048)
    expect(config.avatarAllowedMime).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    expect(config.clubCoversBucket).toBe('plot-twist-club-covers')
    expect(config.maxClubCoverSizeBytes).toBe(5_242_880)
    expect(config.maxClubCoverDimension).toBe(4096)
    expect(config.clubCoverAllowedMime).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    expect(config.presignedPostTtlSeconds).toBe(300)
  })

  it('treats missing S3_ENDPOINT as null', () => {
    delete process.env.S3_ENDPOINT
    const config = storageConfig()
    expect(config.endpoint).toBeNull()
  })

  it('treats empty S3_PUBLIC_URL_BASE as null', () => {
    process.env.S3_PUBLIC_URL_BASE = ''
    const config = storageConfig()
    expect(config.publicUrlBase).toBeNull()
  })

  it('returns a frozen config and frozen mime list', () => {
    const config = storageConfig()
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.avatarAllowedMime)).toBe(true)
  })
})
