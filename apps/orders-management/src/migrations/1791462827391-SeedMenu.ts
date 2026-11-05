import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedMenu1791462827391 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "menu_items" ("name", "price") VALUES
        ('Hot Dog', 1.99),
        ('Cheese Dog', 2.49),
        ('Veggie Dog', 2.29),
        ('Corn Dog', 1.79)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "menu_items" WHERE "name" IN ('Hot Dog', 'Cheese Dog', 'Veggie Dog', 'Corn Dog')
    `);
  }
}
