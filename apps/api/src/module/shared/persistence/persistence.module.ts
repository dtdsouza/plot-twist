import { Module } from '@nestjs/common'
import { TypeormPersistenceModule } from '../typeorm'

@Module({
  imports: [TypeormPersistenceModule],
  exports: [TypeormPersistenceModule],
})
export class PersistenceModule {}
