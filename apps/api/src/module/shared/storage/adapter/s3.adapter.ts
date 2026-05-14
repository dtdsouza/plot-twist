import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { STORAGE_CONFIG_KEY, type IStorageConfig } from '@module/shared/config'
import type { IPresignedPostOptions } from '../interface/presigned-post-options.interface'
import type { IPresignedPost } from '../interface/presigned-post.interface'
import type { IObjectMetadata } from '../interface/object-metadata.interface'
import type { IStoragePort } from '../port/storage.port'

@Injectable()
export class S3StorageAdapter implements IStoragePort {
  private readonly client: S3Client
  private readonly endpoint: string | null
  private readonly publicUrlBase: string | null
  private readonly region: string

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<IStorageConfig>(STORAGE_CONFIG_KEY)
    this.endpoint = config.endpoint
    this.publicUrlBase = config.publicUrlBase
    this.region = config.region

    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.endpoint ? { forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async createPresignedPost(
    options: IPresignedPostOptions,
  ): Promise<IPresignedPost> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: options.bucket,
      Key: options.key,
      Conditions: [
        ['content-length-range', 1, options.maxContentLength],
        ['starts-with', '$Content-Type', options.contentTypePrefix],
      ],
      Fields: {
        'Content-Type': options.contentTypePrefix,
      },
      Expires: options.expiresInSeconds,
    })

    const expiresAt = new Date(Date.now() + options.expiresInSeconds * 1000)

    return Object.freeze({
      url,
      fields: Object.freeze({ ...fields }),
      key: options.key,
      expiresAt,
    })
  }

  async headObject(
    bucket: string,
    key: string,
  ): Promise<IObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      )

      return Object.freeze({
        contentType: response.ContentType ?? null,
        contentLength: response.ContentLength ?? 0,
        etag: response.ETag ?? null,
      })
    } catch (error) {
      if (this.isNotFound(error)) {
        return null
      }
      throw error
    }
  }

  async getObjectRange(
    bucket: string,
    key: string,
    byteRange: string,
  ): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${byteRange}`,
      }),
    )

    if (!response.Body) {
      return Buffer.alloc(0)
    }

    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: destinationBucket,
        Key: destinationKey,
        CopySource: `/${sourceBucket}/${encodeURIComponent(sourceKey)}`,
      }),
    )
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    )
  }

  buildPublicUrl(bucket: string, key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')

    if (this.publicUrlBase) {
      return `${this.publicUrlBase.replace(/\/$/, '')}/${encodedKey}`
    }

    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, '')}/${bucket}/${encodedKey}`
    }

    return `https://${bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`
  }

  private isNotFound(error: unknown): boolean {
    if (error instanceof NotFound) {
      return true
    }
    const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode
    return httpStatus === 404
  }
}
