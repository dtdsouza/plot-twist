import type { IPresignedPostOptions } from '../interface/presigned-post-options.interface'
import type { IPresignedPost } from '../interface/presigned-post.interface'
import type { IObjectMetadata } from '../interface/object-metadata.interface'

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER')

export interface IStorageProvider {
  createPresignedPost(options: IPresignedPostOptions): Promise<IPresignedPost>
  headObject(bucket: string, key: string): Promise<IObjectMetadata | null>
  getObjectRange(bucket: string, key: string, byteRange: string): Promise<Buffer>
  copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
  ): Promise<void>
  deleteObject(bucket: string, key: string): Promise<void>
  buildPublicUrl(bucket: string, key: string): string
}
