import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateClubInviteTable1748822400000 implements MigrationInterface {
  name = 'CreateClubInviteTable1748822400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clubs"."club_invite" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"clubId" uuid NOT NULL, ` +
        `"token" character varying(64) NOT NULL, ` +
        `"createdByUserId" uuid NOT NULL, ` +
        `"expiresAt" TIMESTAMP WITH TIME ZONE, ` +
        `"revokedAt" TIMESTAMP WITH TIME ZONE, ` +
        `CONSTRAINT "PK_club_invite_id" PRIMARY KEY ("id")` +
        `)`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_club_invite_token" ON "clubs"."club_invite" ("token")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_club_invite_club" ON "clubs"."club_invite" ("clubId")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "clubs"."IDX_club_invite_club"`,
    )
    await queryRunner.query(
      `DROP INDEX "clubs"."UQ_club_invite_token"`,
    )
    await queryRunner.query(`DROP TABLE "clubs"."club_invite"`)
  }
}
