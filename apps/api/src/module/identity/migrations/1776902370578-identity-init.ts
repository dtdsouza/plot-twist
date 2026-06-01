import { MigrationInterface, QueryRunner } from "typeorm";

export class IdentityInit1776902370578 implements MigrationInterface {
  name = "IdentityInit1776902370578";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "identity"`);
    await queryRunner.query(
      `CREATE TYPE "identity"."user_status_enum" AS ENUM('active', 'inactive', 'suspended')`
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."user" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "passwordHash" character varying(255) NOT NULL, "displayName" character varying(100) NOT NULL, "avatar" character varying(500), "bio" text, "status" "identity"."user_status_enum" NOT NULL DEFAULT 'active', CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."password_reset_token" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_838af121380dfe3a6330e04f5bb" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "identity"."password_reset_token"`);
    await queryRunner.query(`DROP TABLE "identity"."user"`);
    await queryRunner.query(`DROP TYPE "identity"."user_status_enum"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "identity"`);
  }
}
