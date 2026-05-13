import { Inject, Injectable, Logger } from '@nestjs/common'
import type { IPresignedPostOptions } from '../interface/presigned-post-options.interface'
import type { IPresignedPost } from '../interface/presigned-post.interface'
import type { IObjectMetadata } from '../interface/object-metadata.interface'
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
} from '../provider/storage-provider.interface'

@Injectable()
export class StorageClient {
  private readonly logger = new Logger(StorageClient.name)

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: IStorageProvider,
  ) {}

  async createPresignedPost(
    options: IPresignedPostOptions,
  ): Promise<IPresignedPost> {
    this.logger.log(
      `presigned-post bucket=${options.bucket} key=${options.key} max=${options.maxContentLength}`,
    )
    return this.provider.createPresignedPost(options)
  }

  async headObject(
    bucket: string,
    key: string,
  ): Promise<IObjectMetadata | null> {
    return this.provider.headObject(bucket, key)
  }

  async getObjectRange(
    bucket: string,
    key: string,
    byteRange: string,
  ): Promise<Buffer> {
    return this.provider.getObjectRange(bucket, key, byteRange)
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
  ): Promise<void> {
    this.logger.log(
      `copy ${sourceBucket}/${sourceKey} -> ${destinationBucket}/${destinationKey}`,
    )
    return this.provider.copyObject(
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey,
    )
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    this.logger.log(`delete ${bucket}/${key}`)
    return this.provider.deleteObject(bucket, key)
  }

  buildPublicUrl(bucket: string, key: string): string {
    return this.provider.buildPublicUrl(bucket, key)
  }
}
