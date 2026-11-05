import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791462826391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "idempotencyKey" uuid NOT NULL,
        "terminalId" character varying NOT NULL,
        "items" jsonb NOT NULL,
        "inventoryIssue" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("idempotencyKey")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "terminal_stock" (
        "terminalId" character varying NOT NULL,
        "itemName" character varying NOT NULL,
        "quantity" integer NOT NULL,
        "capacity" integer NOT NULL,
        CONSTRAINT "PK_terminal_stock" PRIMARY KEY ("terminalId", "itemName")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "menu_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "price" double precision NOT NULL,
        CONSTRAINT "PK_menu_items" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "menu_items"`);
    await queryRunner.query(`DROP TABLE "terminal_stock"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }
}
