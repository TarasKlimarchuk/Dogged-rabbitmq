import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_CAPACITY = 50;

// Which terminals orders-management knows about comes from the same
// KNOWN_TERMINAL_IDS env var every environment already shares (docker-compose
// sets it once, the same way TERMINAL_ID is set per terminal instance) —
// not hardcoded here, so adding a terminal doesn't require editing this file.
export class SeedTerminalStock1791462828391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const terminalIds = (process.env.KNOWN_TERMINAL_IDS ?? 'terminal-a')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    const menuItems: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM "menu_items"`,
    );

    for (const terminalId of terminalIds) {
      for (const { name } of menuItems) {
        await queryRunner.query(
          `INSERT INTO "terminal_stock" ("terminalId", "itemName", "quantity", "capacity") VALUES ($1, $2, $3, $3)`,
          [terminalId, name, DEFAULT_CAPACITY],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "terminal_stock"`);
  }
}
