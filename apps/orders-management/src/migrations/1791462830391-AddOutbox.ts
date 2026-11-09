import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutbox1791462830391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbox" (
        "id" uuid NOT NULL,
        "pattern" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "publishedAt" timestamptz NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" text NULL,
        CONSTRAINT "PK_outbox" PRIMARY KEY ("id")
      )
    `);

    // The relay only ever scans unsent rows, so index just those: the index
    // stays small no matter how many sent rows pile up.
    await queryRunner.query(`
      CREATE INDEX "IDX_outbox_unpublished" ON "outbox" ("createdAt")
      WHERE "publishedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
