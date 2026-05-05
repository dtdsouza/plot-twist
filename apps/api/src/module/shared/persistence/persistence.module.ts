import { Module } from '@nestjs/common'
import { TypeormPersistenceModule } from '@module/shared/typeorm'

@Module({
  imports: [TypeormPersistenceModule],
  exports: [TypeormPersistenceModule],
})
export class PersistenceModule {}
