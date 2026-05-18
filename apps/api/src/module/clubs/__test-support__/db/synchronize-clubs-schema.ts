import { Test, type TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ensureClubsSchema } from './schema-setup'
import { CLUBS_TEST_ENTITIES } from './clubs-entities'

export interface ClubsSchemaBootstrap {
  dataSource: DataSource
  close: () => Promise<void>
}

export async function synchronizeClubsSchema(): Promise<ClubsSchemaBootstrap> {
  await ensureClubsSchema()

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'plot-twist',
        entities: [...CLUBS_TEST_ENTITIES],
        synchronize: true,
      }),
    ],
  }).compile()

  return {
    dataSource: module.get(DataSource),
    close: () => module.close(),
  }
}
