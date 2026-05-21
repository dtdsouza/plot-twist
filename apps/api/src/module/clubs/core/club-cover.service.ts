import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'node:crypto'
import { imageSize } from 'image-size'
import { StorageClient } from '@module/shared/storage'
import { STORAGE_CONFIG_KEY, type IStorageConfig } from '@module/shared/config'
import { sniffImage } from '@module/shared/image'
import { ClubRepository } from '../persistence/repository/club.repository'
import { MembershipRepository } from '../persistence/repository/membership.repository'
import type { ClubEntity } from '../persistence/entity/club.entity'
import type { IClubCoverUploadIntentResponse } from '../http/dto/cover-upload-intent-response.interface'
import type { CoverUploadIntentDto } from '../http/dto/cover-upload-intent.dto'

const SNIFF_RANGE = '0-4095'
const PENDING_SEGMENT = 'cover/pending'
const COMMITTED_SEGMENT = 'cover'

@Injectable()
export class ClubCoverService {
  private readonly logger = new Logger('Clubs.ClubCoverService')
  private readonly config: IStorageConfig
  private readonly allowedMime: ReadonlySet<string>

  constructor(
    private readonly storageClient: StorageClient,
    private readonly clubRepository: ClubRepository,
    private readonly membershipRepository: MembershipRepository,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<IStorageConfig>(STORAGE_CONFIG_KEY)
    this.allowedMime = new Set(this.config.clubCoverAllowedMime)
  }

  async requestUploadIntent(
    clubId: string,
    ownerId: string,
    dto: CoverUploadIntentDto,
  ): Promise<IClubCoverUploadIntentResponse> {
    await this.requireOwner(clubId, ownerId)

    if (!this.allowedMime.has(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported content type. Allowed: ${this.config.clubCoverAllowedMime.join(', ')}`,
      )
    }

    if (dto.contentLength > this.config.maxClubCoverSizeBytes) {
      throw new BadRequestException(
        `File too large. Max ${this.config.maxClubCoverSizeBytes} bytes`,
      )
    }

    const uploadId = crypto.randomUUID()
    const key = `clubs/${clubId}/${PENDING_SEGMENT}/${uploadId}`

    const presigned = await this.storageClient.createPresignedPost({
      bucket: this.config.clubCoversBucket,
      key,
      maxContentLength: this.config.maxClubCoverSizeBytes,
      contentTypePrefix: 'image/',
      expiresInSeconds: this.config.presignedPostTtlSeconds,
    })

    return Object.freeze({
      url: presigned.url,
      fields: presigned.fields,
      key: presigned.key,
      expiresAt: presigned.expiresAt.toISOString(),
      limits: Object.freeze({
        maxContentLength: this.config.maxClubCoverSizeBytes,
        maxDimension: this.config.maxClubCoverDimension,
        allowedMime: this.config.clubCoverAllowedMime,
      }),
    })
  }

  async finalize(
    clubId: string,
    ownerId: string,
    uploadKey: string,
  ): Promise<ClubEntity> {
    await this.requireOwner(clubId, ownerId)
    this.assertKeyBelongsToClub(uploadKey, clubId)

    const metadata = await this.storageClient.headObject(
      this.config.clubCoversBucket,
      uploadKey,
    )

    if (!metadata) {
      throw new NotFoundException('Upload not found. Re-upload and try again.')
    }

    if (metadata.contentLength > this.config.maxClubCoverSizeBytes) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException('Uploaded file exceeds size limit.')
    }

    const head = await this.storageClient.getObjectRange(
      this.config.clubCoversBucket,
      uploadKey,
      SNIFF_RANGE,
    )

    const sniffed = sniffImage(head)
    if (!sniffed || !this.allowedMime.has(sniffed.mime)) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException('Uploaded file is not a supported image.')
    }

    const dimensions = this.readDimensions(head)
    if (!dimensions) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException('Could not determine image dimensions.')
    }

    if (
      dimensions.width > this.config.maxClubCoverDimension ||
      dimensions.height > this.config.maxClubCoverDimension
    ) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException(
        `Image dimensions exceed ${this.config.maxClubCoverDimension}px limit.`,
      )
    }

    // The uploadId is the last path segment of the pending key
    const uploadId = uploadKey.substring(uploadKey.lastIndexOf('/') + 1)
    const finalKey = `clubs/${clubId}/${COMMITTED_SEGMENT}/${uploadId}.${sniffed.extension}`

    await this.storageClient.copyObject(
      this.config.clubCoversBucket,
      uploadKey,
      this.config.clubCoversBucket,
      finalKey,
    )
    await this.safeDelete(uploadKey)

    const existing = await this.clubRepository.findOne({ id: clubId })
    if (!existing) {
      throw new NotFoundException('Club not found')
    }

    const newCoverUrl = this.storageClient.buildPublicUrl(
      this.config.clubCoversBucket,
      finalKey,
    )

    await this.deletePriorCover(clubId, existing.coverImageUrl, finalKey)

    return this.clubRepository.update(clubId, { coverImageUrl: newCoverUrl })
  }

  private async requireOwner(clubId: string, ownerId: string): Promise<void> {
    const club = await this.clubRepository.findOne({ id: clubId })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    const isOwner = await this.membershipRepository.existsOwnership(clubId, ownerId)
    if (!isOwner) {
      throw new ForbiddenException('Only the club owner can perform this action')
    }
  }

  private assertKeyBelongsToClub(key: string, clubId: string): void {
    const expectedPrefix = `clubs/${clubId}/${PENDING_SEGMENT}/`
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Upload key does not belong to this club.')
    }
    const remainder = key.slice(expectedPrefix.length)
    if (remainder.length === 0 || remainder.includes('/')) {
      throw new ForbiddenException('Upload key has an invalid shape.')
    }
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storageClient.deleteObject(this.config.clubCoversBucket, key)
    } catch (error) {
      this.logger.warn(
        `failed to delete object ${key}: ${(error as Error).message}`,
      )
    }
  }

  private async deletePriorCover(
    clubId: string,
    priorUrl: string | null,
    newFinalKey: string,
  ): Promise<void> {
    if (!priorUrl) {
      return
    }
    const priorKey = this.extractKeyFromUrl(priorUrl)
    if (!priorKey || priorKey === newFinalKey) {
      return
    }
    if (!priorKey.startsWith(`clubs/${clubId}/${COMMITTED_SEGMENT}/`)) {
      return
    }
    await this.safeDelete(priorKey)
  }

  private extractKeyFromUrl(url: string): string | null {
    if (this.config.publicUrlBase) {
      const base = this.config.publicUrlBase.replace(/\/$/, '')
      if (url.startsWith(base + '/')) {
        return decodeURI(url.substring(base.length + 1))
      }
    }
    if (this.config.endpoint) {
      const prefix = `${this.config.endpoint.replace(/\/$/, '')}/${this.config.clubCoversBucket}/`
      if (url.startsWith(prefix)) {
        return decodeURI(url.substring(prefix.length))
      }
    }
    const stdPrefix = `https://${this.config.clubCoversBucket}.s3.${this.config.region}.amazonaws.com/`
    if (url.startsWith(stdPrefix)) {
      return decodeURI(url.substring(stdPrefix.length))
    }
    return null
  }

  private readDimensions(
    buffer: Buffer,
  ): { width: number; height: number } | null {
    try {
      const result = imageSize(buffer)
      if (
        typeof result.width !== 'number' ||
        typeof result.height !== 'number'
      ) {
        return null
      }
      return { width: result.width, height: result.height }
    } catch {
      return null
    }
  }
}
