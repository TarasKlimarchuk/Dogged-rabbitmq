import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestockPendingColumn1791462829391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terminal_stock" ADD COLUMN "restockPending" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "terminal_stock" DROP COLUMN "restockPending"`);
  }
}
