import { Test, type TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageClient } from '@module/shared/storage'
import { STORAGE_CONFIG_KEY } from '@module/shared/config'
import { ClubCoverService } from '../club-cover.service'
import { ClubRepository } from '../../persistence/repository/club.repository'
import { MembershipRepository } from '../../persistence/repository/membership.repository'
import type { ClubEntity } from '../../persistence/entity/club.entity'

jest.mock('image-size', () => ({
  imageSize: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { imageSize } = require('image-size') as { imageSize: jest.Mock }

const baseStorageConfig = {
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  avatarsBucket: 'plot-twist-avatars',
  publicUrlBase: null,
  maxAvatarSizeBytes: 2_097_152,
  maxAvatarDimension: 2048,
  avatarAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  clubCoversBucket: 'plot-twist-club-covers',
  maxClubCoverSizeBytes: 5_242_880,
  maxClubCoverDimension: 4096,
  clubCoverAllowedMime: ['image/jpeg', 'image/png', 'image/webp'],
  presignedPostTtlSeconds: 300,
}

const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const MEMBER_ID = '22222222-2222-2222-2222-222222222222'
const CLUB_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const UPLOAD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PENDING_KEY = `clubs/${CLUB_ID}/cover/pending/${UPLOAD_ID}`

const jpegMagic = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.alloc(4093),
])

function makeClub(overrides?: Partial<ClubEntity>): ClubEntity {
  return {
    id: CLUB_ID,
    name: 'Book Worms',
    description: null,
    ownerId: OWNER_ID,
    coverImageUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as ClubEntity
}

async function buildService(overrides?: {
  storageOverrides?: Partial<typeof baseStorageConfig>
  club?: ClubEntity | null
  isOwner?: boolean
}) {
  const config = { ...baseStorageConfig, ...(overrides?.storageOverrides ?? {}) }
  const club = overrides?.club === undefined ? makeClub() : overrides.club
  const isOwner = overrides?.isOwner ?? true

  const storageClient: jest.Mocked<StorageClient> = {
    createPresignedPost: jest.fn(),
    headObject: jest.fn(),
    getObjectRange: jest.fn(),
    copyObject: jest.fn(),
    deleteObject: jest.fn(),
    buildPublicUrl: jest.fn(),
  } as unknown as jest.Mocked<StorageClient>

  const clubRepository = {
    findOne: jest.fn().mockResolvedValue(club),
    update: jest.fn().mockImplementation(async (_id: string, patch: Partial<ClubEntity>) => ({
      ...club!,
      ...patch,
    })),
  }

  const membershipRepository = {
    existsOwnership: jest.fn().mockResolvedValue(isOwner),
  }

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === STORAGE_CONFIG_KEY) return config
      throw new Error(`unexpected config key: ${key}`)
    }),
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ClubCoverService,
      { provide: StorageClient, useValue: storageClient },
      { provide: ClubRepository, useValue: clubRepository },
      { provide: MembershipRepository, useValue: membershipRepository },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile()

  return {
    service: module.get(ClubCoverService),
    storageClient,
    clubRepository,
    membershipRepository,
  }
}

describe('ClubCoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  describe('requestUploadIntent', () => {
    it('throws ForbiddenException for a non-owner', async () => {
      // Arrange
      const { service } = await buildService({ isOwner: false })

      // Act & Assert
      await expect(
        service.requestUploadIntent(CLUB_ID, MEMBER_ID, {
          contentType: 'image/jpeg',
          contentLength: 1000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws NotFoundException when club is missing', async () => {
      // Arrange
      const { service } = await buildService({ club: null })

      // Act & Assert
      await expect(
        service.requestUploadIntent(CLUB_ID, OWNER_ID, {
          contentType: 'image/jpeg',
          contentLength: 1000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException for a MIME type outside the allow-list', async () => {
      // Arrange
      const { service, storageClient } = await buildService()

      // Act & Assert
      await expect(
        service.requestUploadIntent(CLUB_ID, OWNER_ID, {
          contentType: 'image/svg+xml',
          contentLength: 1000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(storageClient.createPresignedPost).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when content-length exceeds the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()

      // Act & Assert
      await expect(
        service.requestUploadIntent(CLUB_ID, OWNER_ID, {
          contentType: 'image/jpeg',
          contentLength: 5_242_881,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(storageClient.createPresignedPost).not.toHaveBeenCalled()
    })

    it('happy path: returns presigned post with clubs/{clubId}/cover/pending/ key prefix', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      const expiresAt = new Date('2026-06-01T12:00:00Z')
      storageClient.createPresignedPost.mockResolvedValue({
        url: 'https://s3.example/b',
        fields: { key: PENDING_KEY },
        key: PENDING_KEY,
        expiresAt,
      })

      // Act
      const result = await service.requestUploadIntent(CLUB_ID, OWNER_ID, {
        contentType: 'image/jpeg',
        contentLength: 1_000_000,
      })

      // Assert
      expect(storageClient.createPresignedPost).toHaveBeenCalledWith({
        bucket: 'plot-twist-club-covers',
        key: expect.stringMatching(
          new RegExp(`^clubs/${CLUB_ID}/cover/pending/[0-9a-f-]{36}$`),
        ),
        maxContentLength: 5_242_880,
        contentTypePrefix: 'image/',
        expiresInSeconds: 300,
      })
      expect(result.url).toBe('https://s3.example/b')
      expect(result.expiresAt).toBe(expiresAt.toISOString())
      expect(result.limits).toEqual({
        maxContentLength: 5_242_880,
        maxDimension: 4096,
        allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
      })
    })
  })

  describe('finalize', () => {
    it('happy path: validates, copies, deletes pending, persists URL', async () => {
      // Arrange
      const { service, storageClient, clubRepository } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 500_000,
        etag: '"abc"',
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 800, height: 600, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue(
        `http://localhost:4566/plot-twist-club-covers/clubs/${CLUB_ID}/cover/${UPLOAD_ID}.jpg`,
      )

      // Act
      const result = await service.finalize(CLUB_ID, OWNER_ID, PENDING_KEY)

      // Assert
      expect(storageClient.headObject).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
      )
      expect(storageClient.getObjectRange).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
        '0-4095',
      )
      expect(storageClient.copyObject).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
        'plot-twist-club-covers',
        `clubs/${CLUB_ID}/cover/${UPLOAD_ID}.jpg`,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
      )
      expect(clubRepository.update).toHaveBeenCalledWith(CLUB_ID, {
        coverImageUrl: `http://localhost:4566/plot-twist-club-covers/clubs/${CLUB_ID}/cover/${UPLOAD_ID}.jpg`,
      })
      expect(result.coverImageUrl).toContain(`clubs/${CLUB_ID}/cover/${UPLOAD_ID}.jpg`)
    })

    it('throws ForbiddenException for non-owner', async () => {
      // Arrange
      const { service, storageClient } = await buildService({ isOwner: false })

      // Act & Assert
      await expect(service.finalize(CLUB_ID, MEMBER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(storageClient.headObject).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException when key does not start with the expected prefix', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      const wrongKey = `clubs/other-club-id/cover/pending/${UPLOAD_ID}`

      // Act & Assert
      await expect(service.finalize(CLUB_ID, OWNER_ID, wrongKey)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(storageClient.headObject).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when object does not exist on HEAD', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue(null)

      // Act & Assert
      await expect(service.finalize(CLUB_ID, OWNER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(storageClient.deleteObject).not.toHaveBeenCalled()
    })

    it('rejects (and deletes pending) when magic bytes are not a supported image', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 50_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
      )

      // Act & Assert
      await expect(service.finalize(CLUB_ID, OWNER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
      )
      expect(storageClient.copyObject).not.toHaveBeenCalled()
    })

    it('rejects (and deletes pending) when dimensions exceed the max', async () => {
      // Arrange
      const { service, storageClient } = await buildService()
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 1_000_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 5000, height: 5000, type: 'jpg' })

      // Act & Assert
      await expect(service.finalize(CLUB_ID, OWNER_ID, PENDING_KEY)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(storageClient.deleteObject).toHaveBeenCalledWith(
        'plot-twist-club-covers',
        PENDING_KEY,
      )
    })

    it('deletes prior cover on successful second upload', async () => {
      // Arrange
      const priorUrl = `http://localhost:4566/plot-twist-club-covers/clubs/${CLUB_ID}/cover/old-id.jpg`
      const { service, storageClient } = await buildService({
        club: makeClub({ coverImageUrl: priorUrl }),
      })
      storageClient.headObject.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 500_000,
        etag: null,
      })
      storageClient.getObjectRange.mockResolvedValue(jpegMagic)
      imageSize.mockReturnValue({ width: 800, height: 600, type: 'jpg' })
      storageClient.copyObject.mockResolvedValue(undefined)
      storageClient.deleteObject.mockResolvedValue(undefined)
      storageClient.buildPublicUrl.mockReturnValue(
        `http://localhost:4566/plot-twist-club-covers/clubs/${CLUB_ID}/cover/${UPLOAD_ID}.jpg`,
      )

      // Act
      await service.finalize(CLUB_ID, OWNER_ID, PENDING_KEY)

      // Assert: both pending and prior cover were deleted
      const deletedKeys = storageClient.deleteObject.mock.calls.map((c) => c[1])
      expect(deletedKeys).toContain(PENDING_KEY)
      expect(deletedKeys).toContain(`clubs/${CLUB_ID}/cover/old-id.jpg`)
    })
  })
})
