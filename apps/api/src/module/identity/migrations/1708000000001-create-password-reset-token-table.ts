import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreatePasswordResetTokenTable1708000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity."password_reset_token" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash" varchar(64) NOT NULL,
        "userId" uuid NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_identity_password_reset_token_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_identity_password_reset_token_user_id" FOREIGN KEY ("userId") REFERENCES identity."user"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_identity_password_reset_token_token_hash" ON identity."password_reset_token" ("tokenHash")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_identity_password_reset_token_user_id" ON identity."password_reset_token" ("userId")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_identity_password_reset_token_user_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_identity_password_reset_token_token_hash"`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity."password_reset_token"`)
  }
}
