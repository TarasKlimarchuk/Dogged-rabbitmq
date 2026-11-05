import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MenuItem, Order, TerminalStock } from '@app/orders-db';

// Used by the TypeORM CLI only (migration:generate/run/revert) — the running
// app gets its connection config from app.module.ts's TypeOrmModule instead.
export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.ORDERS_DB_NAME ?? 'orders_management',
  entities: [Order, TerminalStock, MenuItem],
  migrations: ['apps/orders-management/src/migrations/*.ts'],
});
