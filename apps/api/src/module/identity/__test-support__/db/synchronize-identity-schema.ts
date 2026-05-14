import { Test, type TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ensureIdentitySchema } from '@module/shared/test-support'
import { UserEntity } from '../../persistence/entity/user.entity'
import { PasswordResetTokenEntity } from '../../persistence/entity/password-reset-token.entity'
import { EmailChangeTokenEntity } from '../../persistence/entity/email-change-token.entity'

export interface IdentitySchemaBootstrap {
  dataSource: DataSource
  close: () => Promise<void>
}

export async function synchronizeIdentitySchema(): Promise<IdentitySchemaBootstrap> {
  await ensureIdentitySchema()

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'plot-twist',
        entities: [UserEntity, PasswordResetTokenEntity, EmailChangeTokenEntity],
        synchronize: true,
      }),
    ],
  }).compile()

  return {
    dataSource: module.get(DataSource),
    close: () => module.close(),
  }
}
