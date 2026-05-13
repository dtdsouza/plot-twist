import { Module } from '@nestjs/common'
import { StorageClient } from './client/storage.client'
import { STORAGE_PROVIDER } from './provider/storage-provider.interface'
import { S3Provider } from './provider/s3.provider'

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: S3Provider,
    },
    StorageClient,
  ],
  exports: [StorageClient],
})
export class StorageModule {}
