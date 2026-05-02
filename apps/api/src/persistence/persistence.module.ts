import { Module } from '@nestjs/common'
import { TypeormPersistenceModule } from '../infra/typeorm'

@Module({
  imports: [TypeormPersistenceModule],
  exports: [TypeormPersistenceModule],
})
export class PersistenceModule {}
