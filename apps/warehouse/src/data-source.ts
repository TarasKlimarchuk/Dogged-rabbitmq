import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
// the entity file only: the @app/outbox barrel would also load the Nest module
import { OutboxMessage } from '@app/outbox/outbox-message.entity.js';
import { Delivery } from '@app/warehouse-db';

// Used by the TypeORM CLI only (migration:generate/run/revert) — the running
// app gets its connection config from app.module.ts's TypeOrmModule instead.
export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.WAREHOUSE_DB_NAME ?? 'warehouse',
  entities: [Delivery, OutboxMessage],
  migrations: ['apps/warehouse/src/migrations/*.ts'],
});
