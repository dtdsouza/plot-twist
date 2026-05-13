import { Test, type TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageClient } from '@module/shared/storage'
import { STORAGE_CONFIG_KEY } from '@module/shared/config'
import { AvatarService } from '../avatar.service'
import { UserRepository } from '../../persistence/repository/user.repository'

jest.mock('image-size', () => ({
  imageSize: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { imageSize } = require('image-size') as { imageSize: jest.Mock }

const baseStorageConfig = {
  region: 'us-east-1',
  endpoint: 'http://localstack:4566',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  avatarsBucket: 'plot-twist-avatars',
  publicUrlBase: null,
  maxAvatarSizeBytes: 2_097_152,
  maxAvatarDimension: 2048,
  avatarAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  presignedPostTtlSeconds: 300,
}

const USER_ID = '11111111-1111-1111-1111-111111111111'
const UPLOAD_ID = '22222222-2222-2222-2222-222222222222'
const PENDING_KEY = `avatars/pending/${USER_ID}/${UPLOAD_ID}`

const jpegMagic = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.alloc(4093),
])

async function buildService(overrides?: {
  storage?: Partial<typeof baseStorageConfig>
  user?: { id: string; avatar: string | null } | null
}) {
  const config = { ...baseStorageConfig, ...(overrides?.storage ?? {}) }

  const storageClient: jest.Mocked<StorageClient> = {
    createPresignedPost: jest.fn(),
    headObject: jest.fn(),
    getObjectRange: jest.fn(),
    copyObject: jest.fn(),
    deleteObject: jest.fn(),
    buildPublicUrl: jest.fn(),
    // private fields are not exercised by tests
  } as unknown as jest.Mocked<StorageClient>

  const userRepository = {
    findOne: jest.fn().mockResolvedValue(
      overrides?.user === null
        ? null
        : overrides?.user ?? {
            id: USER_ID,
            avatar: null,
            email: 'me@example.com',
            displayName: 'Me',
            bio: null,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
    ),
    update: jest.fn().mockImplementation(async (_id, patch) => ({
      id: USER_ID,
      avatar: patch.avatar ?? null,
      email: 'me@example.com',
      displayName: 'Me',
      bio: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    })),
  }

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === STORAGE_CONFIG_KEY) return config
      throw new Error(`unexpected key ${key}`)
    }),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AvatarService,
      { provide: StorageClient, useValue: storageClient },
      { provide: UserRepository, useValue: userRepository },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile()

  return {
    service: module.get(AvatarService),
    storageClient,
    userRepository,
  }
}

describe('AvatarService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('initiateUpload', () => {
    it('returns a presigned post for a valid request', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      const expiresAt = new Date('2026-05-13T12:05:00Z')
      storageClient.createPresignedPost.mockResolvedValue({
        url: 'https://s3.example/b',
        fields: { key: 'avatars/pending/u/up' },
        key: 'avatars/pending/u/up',
        expiresAt,
      })

      // Act
      const result = await service.initiateUpload(USER_ID, {
        contentType: 'image/jpeg',
        contentLength: 500_000,
      })

      // Assert
      expect(storageClient.createPresignedPost).toHaveBeenCalledWith({
        bucket: 'plot-twist-avatars',
        key: expect.stringMatching(
          /^avatars\/pending\/11111111-1111-1111-1111-111111111111\/[0-9a-f-]{36}$/,
        ),
        maxContentLength: 2_097_152,
        contentTypePrefix: 'image/',
        expiresInSeconds: 300,
      })
      expect(result.url).toBe('https://s3.example/b')
      expect(result.expiresAt).toBe(expiresAt.toISOString())
      expect(result.limits).toEqual({
        maxContentLength: 2_097_152,
        maxDimension: 2048,
        allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
      })
    })

    it('rejects content-type outside the allowlist (svg)', async () => {
      // Arrange
      const { service, storageClient } = await buildService()

      // Act + Assert
      await expect(
        service.initiateUpload(USER_ID, {
          contentType: 'image/svg+xml',
          contentLength: 100,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(storageClient.createPresignedPost).not.toHaveBeenCalled()
    })

    it('accepts content-length exactly at the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.createPresignedPost.mockResolvedValue({
        url: 'u',
        fields: {},
        key: 'k',
        expiresAt: new Date(),
      })

      // Act + Assert
      await expect(
        service.initiateUpload(USER_ID, {
          contentType: 'image/png',
          contentLength: 2_097_152,
        }),
      ).resolves.toBeDefined()
    })

    it('rejects content-length one byte over the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()

      // Act + Assert
      await expect(
        service.initiateUpload(USER_ID, {
          contentType: 'image/png',
          contentLength: 2_097_153,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(storageClient.createPresignedPost).not.toHaveBeenCalled()
    })
  })

  describe('finalize', () => {
    it('happy path: validates, copies, deletes pending, updates avatar', async () => {
      // Arrange
      const { service, storageClient, userRepository } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 500_000,
        etag: '"abc"',
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 512, height: 512, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue(
        `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/${UPLOAD_ID}.jpg`,
      )

      // Act
      const result = await service.finalize(USER_ID, PENDING_KEY)

      // Assert
      expect(storageClient.headObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
      expect(storageClient.getObjectRange).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
        '0-4095',
      )
      expect(storageClient.copyObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
        'plot-twist-avatars',
        `avatars/${USER_ID}/${UPLOAD_ID}.jpg`,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
      expect(userRepository.update).toHaveBeenCalledWith(USER_ID, {
        avatar: `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/${UPLOAD_ID}.jpg`,
      })
      expect(result.avatar).toContain(`avatars/${USER_ID}/${UPLOAD_ID}.jpg`)
    })

    it('rejects keys belonging to other users', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      const otherUserKey = `avatars/pending/99999999-9999-9999-9999-999999999999/${UPLOAD_ID}`

      // Act + Assert
      await expect(service.finalize(USER_ID, otherUserKey)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(storageClient.headObject).not.toHaveBeenCalled()
    })

    it('rejects keys that walk out of the user prefix', async () => {
      // Arrange
      const { service, storageClient } = await buildService()

      // Act + Assert
      await expect(
        service.finalize(USER_ID, `avatars/pending/${USER_ID}/sub/key`),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(storageClient.headObject).not.toHaveBeenCalled()
    })

    it('returns 404 when the object does not exist', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue(null)

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(storageClient.deleteObject).not.toHaveBeenCalled()
    })

    it('rejects (and cleans up) when content-length exceeds the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 3_000_000,
        etag: null,
      })

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
    })

    it('rejects (and cleans up) when bytes are not a supported image', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(
        Buffer.from('MZ\x90\x00', 'ascii'),
      )

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
      expect(storageClient.copyObject).not.toHaveBeenCalled()
    })

    it('rejects (and cleans up) when dimensions exceed the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 4000, height: 4000, type: 'jpg' })

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
    })

    it('rejects (and cleans up) when image-size throws', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockImplementation(() => {
        throw new Error('parser blew up')
      })

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
      )
    })

    it('derives extension from sniffed bytes, not from the header', async () => {
      // Arrange — header claims JPEG but bytes are PNG
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      const pngMagic = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(4088),
      ])
      storageClient.getObjectRange.mockResolvedValue(pngMagic)
      imageSize.mockReturnValue({ width: 256, height: 256, type: 'png' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue('http://example/avatars/u/k.png')

      // Act
      await service.finalize(USER_ID, PENDING_KEY)

      // Assert
      expect(storageClient.copyObject).toHaveBeenCalledWith(
        'plot-twist-avatars',
        PENDING_KEY,
        'plot-twist-avatars',
        `avatars/${USER_ID}/${UPLOAD_ID}.png`,
      )
    })

    it('deletes the prior avatar on successful replace', async () => {
      // Arrange
      const priorUrl = `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/old-id.jpg`
      const { service, storageClient } = await buildService({
        user: {
          id: USER_ID,
          avatar: priorUrl,
        },
      })
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 256, height: 256, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue(
        `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/${UPLOAD_ID}.jpg`,
      )

      // Act
      await service.finalize(USER_ID, PENDING_KEY)

      // Assert
      const deleteCalls = storageClient.deleteObject.mock.calls.map(
        (call) => call[1],
      )
      expect(deleteCalls).toContain(PENDING_KEY)
      expect(deleteCalls).toContain(`avatars/${USER_ID}/old-id.jpg`)
    })

    it('does not delete prior avatar when prior URL is external', async () => {
      // Arrange
      const externalUrl = 'https://gravatar.com/avatar/abc'
      const { service, storageClient } = await buildService({
        user: { id: USER_ID, avatar: externalUrl },
      })
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 256, height: 256, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue(
        `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/${UPLOAD_ID}.jpg`,
      )

      // Act
      await service.finalize(USER_ID, PENDING_KEY)

      // Assert: only the pending object should be deleted
      const deleteCalls = storageClient.deleteObject.mock.calls.map(
        (call) => call[1],
      )
      expect(deleteCalls).toEqual([PENDING_KEY])
    })

    it('tolerates failure to delete the prior avatar', async () => {
      // Arrange
      const priorUrl = `http://localstack:4566/plot-twist-avatars/avatars/${USER_ID}/old-id.jpg`
      const { service, storageClient } = await buildService({
        user: { id: USER_ID, avatar: priorUrl },
      })
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 256, height: 256, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject
        .mockResolvedValueOnce(undefined) // pending deleted
        .mockRejectedValueOnce(new Error('prior delete failed'))
      storageClient.buildPublicUrl.mockReturnValue('http://example/new.jpg')

      // Act + Assert (should not throw)
      await expect(
        service.finalize(USER_ID, PENDING_KEY),
      ).resolves.toBeDefined()
    })

    it('returns 404 when the user disappears between intent and finalize', async () => {
      // Arrange
      const { service, storageClient } = await buildService({ user: null })
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 256, height: 256, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue('http://example/new.jpg')

      // Act + Assert
      await expect(service.finalize(USER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })
})
