import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateClubsSchemaAndTables1747526400000
  implements MigrationInterface
{
  name = 'CreateClubsSchemaAndTables1747526400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "clubs"`)
    await queryRunner.query(
      `CREATE TYPE "clubs"."membership_role_enum" AS ENUM('owner', 'member')`,
    )
    await queryRunner.query(
      `CREATE TABLE "clubs"."club" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"name" character varying(100) NOT NULL, ` +
        `"description" text, ` +
        `"ownerId" uuid NOT NULL, ` +
        `"coverImageUrl" text, ` +
        `CONSTRAINT "PK_club_id" PRIMARY KEY ("id")` +
        `)`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_club_owner" ON "clubs"."club" ("ownerId")`,
    )
    await queryRunner.query(
      `CREATE TABLE "clubs"."membership" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"clubId" uuid NOT NULL, ` +
        `"userId" uuid NOT NULL, ` +
        `"role" "clubs"."membership_role_enum" NOT NULL, ` +
        `"joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL, ` +
        `CONSTRAINT "PK_membership_id" PRIMARY KEY ("id")` +
        `)`,
    )
    await queryRunner.query(
      `ALTER TABLE "clubs"."membership" ` +
        `ADD CONSTRAINT "FK_membership_club" ` +
        `FOREIGN KEY ("clubId") REFERENCES "clubs"."club"("id") ON DELETE CASCADE`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_membership_club_user" ON "clubs"."membership" ("clubId", "userId")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_user" ON "clubs"."membership" ("userId")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "clubs"."IDX_membership_user"`,
    )
    await queryRunner.query(
      `DROP INDEX "clubs"."UQ_membership_club_user"`,
    )
    await queryRunner.query(
      `ALTER TABLE "clubs"."membership" DROP CONSTRAINT "FK_membership_club"`,
    )
    await queryRunner.query(`DROP TABLE "clubs"."membership"`)
    await queryRunner.query(`DROP INDEX "clubs"."IDX_club_owner"`)
    await queryRunner.query(`DROP TABLE "clubs"."club"`)
    await queryRunner.query(`DROP TYPE "clubs"."membership_role_enum"`)
    await queryRunner.query(`DROP SCHEMA IF EXISTS "clubs"`)
  }
}
