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
import { UserRepository } from '../persistence/repository/user.repository'
import type { IUserResponse } from '../http/dto/auth-response.interface'
import { toUserResponse } from '../http/dto/user-response.mapper'
import type { IAvatarUploadIntentResponse } from '../http/dto/avatar-upload-intent-response.interface'
import { AvatarUploadIntentDto } from '../http/dto/avatar-upload-intent.dto'

const SNIFF_RANGE = '0-4095'
const PENDING_PREFIX = 'avatars/pending'
const FINAL_PREFIX = 'avatars'

@Injectable()
export class AvatarService {
  private readonly logger = new Logger('Identity.AvatarService')
  private readonly config: IStorageConfig
  private readonly allowedMime: ReadonlySet<string>

  constructor(
    private readonly storageClient: StorageClient,
    private readonly userRepository: UserRepository,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<IStorageConfig>(STORAGE_CONFIG_KEY)
    this.allowedMime = new Set(this.config.avatarAllowedMime)
  }

  async initiateUpload(
    userId: string,
    dto: AvatarUploadIntentDto,
  ): Promise<IAvatarUploadIntentResponse> {
    if (!this.allowedMime.has(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported content type. Allowed: ${this.config.avatarAllowedMime.join(', ')}`,
      )
    }

    if (dto.contentLength > this.config.maxAvatarSizeBytes) {
      throw new BadRequestException(
        `File too large. Max ${this.config.maxAvatarSizeBytes} bytes`,
      )
    }

    const uploadId = crypto.randomUUID()
    const key = `${PENDING_PREFIX}/${userId}/${uploadId}`

    const presigned = await this.storageClient.createPresignedPost({
      bucket: this.config.avatarsBucket,
      key,
      maxContentLength: this.config.maxAvatarSizeBytes,
      contentTypePrefix: 'image/',
      expiresInSeconds: this.config.presignedPostTtlSeconds,
    })

    return Object.freeze({
      url: presigned.url,
      fields: presigned.fields,
      key: presigned.key,
      expiresAt: presigned.expiresAt.toISOString(),
      limits: Object.freeze({
        maxContentLength: this.config.maxAvatarSizeBytes,
        maxDimension: this.config.maxAvatarDimension,
        allowedMime: this.config.avatarAllowedMime,
      }),
    })
  }

  async finalize(userId: string, uploadKey: string): Promise<IUserResponse> {
    this.assertKeyBelongsToUser(uploadKey, userId)

    const metadata = await this.storageClient.headObject(
      this.config.avatarsBucket,
      uploadKey,
    )

    if (!metadata) {
      throw new NotFoundException('Upload not found. Re-upload and try again.')
    }

    if (metadata.contentLength > this.config.maxAvatarSizeBytes) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException('Uploaded file exceeds size limit.')
    }

    const head = await this.storageClient.getObjectRange(
      this.config.avatarsBucket,
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
      dimensions.width > this.config.maxAvatarDimension ||
      dimensions.height > this.config.maxAvatarDimension
    ) {
      await this.safeDelete(uploadKey)
      throw new BadRequestException(
        `Image dimensions exceed ${this.config.maxAvatarDimension}px limit.`,
      )
    }

    const uploadId = uploadKey.substring(uploadKey.lastIndexOf('/') + 1)
    const finalKey = `${FINAL_PREFIX}/${userId}/${uploadId}.${sniffed.extension}`

    await this.storageClient.copyObject(
      this.config.avatarsBucket,
      uploadKey,
      this.config.avatarsBucket,
      finalKey,
    )
    await this.safeDelete(uploadKey)

    const existing = await this.userRepository.findOne({ id: userId })
    if (!existing) {
      throw new NotFoundException('User not found')
    }

    const newAvatarUrl = this.storageClient.buildPublicUrl(
      this.config.avatarsBucket,
      finalKey,
    )

    await this.deletePriorAvatar(existing.avatar, finalKey)

    const updated = await this.userRepository.update(userId, {
      avatar: newAvatarUrl,
    })
    return toUserResponse(updated)
  }

  private assertKeyBelongsToUser(key: string, userId: string): void {
    const expectedPrefix = `${PENDING_PREFIX}/${userId}/`
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Upload key does not belong to this user.')
    }
    const remainder = key.slice(expectedPrefix.length)
    if (remainder.length === 0 || remainder.includes('/')) {
      throw new ForbiddenException('Upload key has an invalid shape.')
    }
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storageClient.deleteObject(this.config.avatarsBucket, key)
    } catch (error) {
      this.logger.warn(
        `failed to delete object ${key}: ${(error as Error).message}`,
      )
    }
  }

  private async deletePriorAvatar(
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
    if (!priorKey.startsWith(`${FINAL_PREFIX}/`)) {
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
      const prefix = `${this.config.endpoint.replace(/\/$/, '')}/${this.config.avatarsBucket}/`
      if (url.startsWith(prefix)) {
        return decodeURI(url.substring(prefix.length))
      }
    }
    const stdPrefix = `https://${this.config.avatarsBucket}.s3.${this.config.region}.amazonaws.com/`
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
