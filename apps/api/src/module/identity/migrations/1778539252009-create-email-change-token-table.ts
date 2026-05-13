import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateEmailChangeTokenTable1778539252009 implements MigrationInterface {
  name = 'CreateEmailChangeTokenTable1778539252009'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SCHEMA IF NOT EXISTS "identity"`
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "identity"."email_change_token" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "newEmail" character varying(255) NOT NULL, "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_email_change_token" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_change_token_userId" ON "identity"."email_change_token" ("userId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "identity"."IDX_email_change_token_userId"`
    )
    await queryRunner.query(
      `DROP TABLE IF EXISTS "identity"."email_change_token"`
    )
  }
}
