import { MigrationInterface, QueryRunner } from 'typeorm';

// Whether orders-management was told about a delivery is now the outbox row's
// publishedAt, so the flag the HTTP callback used to set is gone.
export class DropNotifiedOrdersManagement1791462833391
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill: deliveries confirmed under the old HTTP callback that never
    // got through (the endpoint didn't exist) would otherwise be lost, and
    // their terminal/item would keep restockPending = true forever. Hand them
    // to the outbox so the relay publishes them like any new confirmation.
    await queryRunner.query(`
      INSERT INTO "outbox" ("id", "pattern", "payload")
      SELECT
        gen_random_uuid(),
        'replenishment.restock_delivered',
        jsonb_build_object(
          'deliveryId', "id",
          'terminalId', "terminalId",
          'itemName', "itemName",
          'quantity', "quantity"
        )
      FROM "deliveries"
      WHERE "delivered" AND NOT "notifiedOrdersManagement"
    `);

    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN "notifiedOrdersManagement"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "notifiedOrdersManagement" boolean NOT NULL DEFAULT false`,
    );
  }
}
