import { MigrationInterface, QueryRunner } from 'typeorm';

// The client-generated idempotency key is the order's identity, so it is now
// called orderId everywhere (API, messages, logs). The PK_orders constraint
// follows the column, so only the column needs renaming.
export class RenameOrdersIdempotencyKey1791462832391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "idempotencyKey" TO "orderId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "orderId" TO "idempotencyKey"`,
    );
  }
}
