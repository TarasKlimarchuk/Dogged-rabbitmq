import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedMessages1791462831391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "processed_messages" (
        "messageId" uuid NOT NULL,
        "processedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processed_messages" PRIMARY KEY ("messageId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_messages"`);
  }
}
