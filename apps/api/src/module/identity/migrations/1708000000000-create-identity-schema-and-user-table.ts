import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateIdentitySchemaAndUserTable1708000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`)

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE identity.user_status_enum AS ENUM ('active', 'inactive', 'suspended');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity."user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "displayName" varchar(100) NOT NULL,
        "avatar" varchar(500) DEFAULT NULL,
        "bio" text DEFAULT NULL,
        "status" identity.user_status_enum NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_identity_user_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_identity_user_email" UNIQUE ("email")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_identity_user_email" ON identity."user" ("email")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_identity_user_email"`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity."user"`)
    await queryRunner.query(`DROP TYPE IF EXISTS identity.user_status_enum`)
    await queryRunner.query(`DROP SCHEMA IF EXISTS identity`)
  }
}
