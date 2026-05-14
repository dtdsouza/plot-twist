import { Module } from '@nestjs/common'
import { StorageClient } from './client/storage.client'
import { STORAGE_PORT } from './port/storage.port'
import { S3StorageAdapter } from './adapter/s3.adapter'

@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useClass: S3StorageAdapter,
    },
    StorageClient,
  ],
  exports: [StorageClient],
})
export class StorageModule {}
