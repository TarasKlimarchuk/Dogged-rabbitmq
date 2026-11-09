import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestockRequestId1791462831391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "restockRequestId" uuid NULL`,
    );
    // Postgres treats NULLs as distinct, so older deliveries (no request id)
    // don't collide with each other.
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD CONSTRAINT "UQ_deliveries_restockRequestId" UNIQUE ("restockRequestId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP CONSTRAINT "UQ_deliveries_restockRequestId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN "restockRequestId"`,
    );
  }
}
