import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791462830391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "terminalId" character varying NOT NULL,
        "itemName" character varying NOT NULL,
        "quantity" integer NOT NULL,
        "delivered" boolean NOT NULL DEFAULT false,
        "notifiedOrdersManagement" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveries" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deliveries"`);
  }
}
