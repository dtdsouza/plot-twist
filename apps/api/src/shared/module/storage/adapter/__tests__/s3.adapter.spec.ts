import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { STORAGE_CONFIG_KEY } from '@module/shared/config'

const mockSend = jest.fn()
const mockCreatePresignedPost = jest.fn()

jest.mock('@aws-sdk/client-s3', () => {
  class FakeNotFound extends Error {
    name = 'NotFound'
  }
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({
      __command: 'HeadObject',
      input,
    })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({
      __command: 'GetObject',
      input,
    })),
    CopyObjectCommand: jest.fn().mockImplementation((input) => ({
      __command: 'CopyObject',
      input,
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({
      __command: 'DeleteObject',
      input,
    })),
    NotFound: FakeNotFound,
  }
})

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: (...args: unknown[]) => mockCreatePresignedPost(...args),
}))

import { S3StorageAdapter } from '../s3.adapter'

const baseStorageConfig = {
  region: 'us-east-1',
  endpoint: null,
  accessKeyId: 'test',
  secretAccessKey: 'test',
  avatarsBucket: 'plot-twist-avatars',
  publicUrlBase: null,
  maxAvatarSizeBytes: 2_097_152,
  maxAvatarDimension: 2048,
  avatarAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  presignedPostTtlSeconds: 300,
}

async function buildProvider(
  overrides: Partial<typeof baseStorageConfig> = {},
): Promise<S3StorageAdapter> {
  const config = { ...baseStorageConfig, ...overrides }
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue(config),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      S3StorageAdapter,
      { provide: ConfigService, useValue: mockConfigService },
    ],
  }).compile()

  return module.get(S3StorageAdapter)
}

describe('S3StorageAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  it('is defined', async () => {
    const provider = await buildProvider()
    expect(provider).toBeDefined()
  })

  describe('createPresignedPost', () => {
    it('forwards options to the SDK and shapes the response', async () => {
      // Arrange
      const provider = await buildProvider()
      mockCreatePresignedPost.mockResolvedValue({
        url: 'https://s3.example/bucket',
        fields: { key: 'avatars/pending/u/up', policy: 'p' },
      })
      const before = Date.now()

      // Act
      const result = await provider.createPresignedPost({
        bucket: 'plot-twist-avatars',
        key: 'avatars/pending/u/up',
        maxContentLength: 2_097_152,
        contentTypePrefix: 'image/',
        expiresInSeconds: 300,
      })

      // Assert
      const sdkCall = mockCreatePresignedPost.mock.calls[0][1]
      expect(sdkCall.Bucket).toBe('plot-twist-avatars')
      expect(sdkCall.Key).toBe('avatars/pending/u/up')
      expect(sdkCall.Expires).toBe(300)
      expect(sdkCall.Conditions).toEqual([
        ['content-length-range', 1, 2_097_152],
        ['starts-with', '$Content-Type', 'image/'],
      ])
      expect(sdkCall.Fields).toEqual({ 'Content-Type': 'image/' })
      expect(result.url).toBe('https://s3.example/bucket')
      expect(result.key).toBe('avatars/pending/u/up')
      expect(result.fields).toEqual({
        key: 'avatars/pending/u/up',
        policy: 'p',
      })
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 299_000)
    })
  })

  describe('headObject', () => {
    it('returns metadata when the object exists', async () => {
      // Arrange
      const provider = await buildProvider()
      mockSend.mockResolvedValue({
        ContentType: 'image/jpeg',
        ContentLength: 4096,
        ETag: '"abc"',
      })

      // Act
      const result = await provider.headObject('b', 'k')

      // Assert
      expect(result).toEqual({
        contentType: 'image/jpeg',
        contentLength: 4096,
        etag: '"abc"',
      })
    })

    it('returns null when AWS throws a NotFound exception', async () => {
      // Arrange
      const provider = await buildProvider()
      const { NotFound } = jest.requireMock('@aws-sdk/client-s3')
      mockSend.mockRejectedValue(new NotFound({ message: 'no', $metadata: {} }))

      // Act
      const result = await provider.headObject('b', 'missing')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when error carries $metadata.httpStatusCode 404', async () => {
      // Arrange
      const provider = await buildProvider()
      const error = Object.assign(new Error('not found'), {
        $metadata: { httpStatusCode: 404 },
      })
      mockSend.mockRejectedValue(error)

      // Act
      const result = await provider.headObject('b', 'missing')

      // Assert
      expect(result).toBeNull()
    })

    it('rethrows non-not-found errors', async () => {
      // Arrange
      const provider = await buildProvider()
      mockSend.mockRejectedValue(new Error('network down'))

      // Act + Assert
      await expect(provider.headObject('b', 'k')).rejects.toThrow('network down')
    })
  })

  describe('getObjectRange', () => {
    it('asks for the byte range and returns a buffer', async () => {
      // Arrange
      const provider = await buildProvider()
      const transformToByteArray = jest
        .fn()
        .mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
      mockSend.mockResolvedValue({ Body: { transformToByteArray } })

      // Act
      const result = await provider.getObjectRange('b', 'k', '0-4095')

      // Assert
      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k', Range: 'bytes=0-4095' })
      expect(result.equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
    })

    it('returns an empty buffer when the response has no body', async () => {
      // Arrange
      const provider = await buildProvider()
      mockSend.mockResolvedValue({ Body: undefined })

      // Act
      const result = await provider.getObjectRange('b', 'k', '0-3')

      // Assert
      expect(result.length).toBe(0)
    })
  })

  describe('copyObject', () => {
    it('builds the CopySource and sends a copy command', async () => {
      // Arrange
      const provider = await buildProvider()
      mockSend.mockResolvedValue({})

      // Act
      await provider.copyObject('src-b', 'src-k space', 'dst-b', 'dst-k')

      // Assert
      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.input).toEqual({
        Bucket: 'dst-b',
        Key: 'dst-k',
        CopySource: `/src-b/${encodeURIComponent('src-k space')}`,
      })
    })
  })

  describe('deleteObject', () => {
    it('sends a delete command with bucket and key', async () => {
      // Arrange
      const provider = await buildProvider()
      mockSend.mockResolvedValue({})

      // Act
      await provider.deleteObject('b', 'k')

      // Assert
      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.input).toEqual({ Bucket: 'b', Key: 'k' })
    })
  })

  describe('buildPublicUrl', () => {
    it('uses publicUrlBase when configured', async () => {
      // Arrange
      const provider = await buildProvider({
        publicUrlBase: 'https://cdn.example.com/',
      })

      // Act
      const url = provider.buildPublicUrl('plot-twist-avatars', 'avatars/u/abc.jpg')

      // Assert
      expect(url).toBe('https://cdn.example.com/avatars/u/abc.jpg')
    })

    it('uses endpoint + path-style when endpoint is configured (LocalStack)', async () => {
      // Arrange
      const provider = await buildProvider({
        endpoint: 'http://localstack:4566',
      })

      // Act
      const url = provider.buildPublicUrl('plot-twist-avatars', 'avatars/u/abc.jpg')

      // Assert
      expect(url).toBe(
        'http://localstack:4566/plot-twist-avatars/avatars/u/abc.jpg',
      )
    })

    it('falls back to standard S3 URL when neither endpoint nor publicUrlBase is set', async () => {
      // Arrange
      const provider = await buildProvider()

      // Act
      const url = provider.buildPublicUrl('plot-twist-avatars', 'avatars/u/abc.jpg')

      // Assert
      expect(url).toBe(
        'https://plot-twist-avatars.s3.us-east-1.amazonaws.com/avatars/u/abc.jpg',
      )
    })

    it('encodes each path segment but preserves separators', async () => {
      // Arrange
      const provider = await buildProvider()

      // Act
      const url = provider.buildPublicUrl('b', 'a/b c/d.png')

      // Assert
      expect(url).toBe('https://b.s3.us-east-1.amazonaws.com/a/b%20c/d.png')
    })
  })
})
