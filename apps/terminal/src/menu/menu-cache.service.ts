import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface MenuItem {
  name: string;
  price: number;
}

export interface MenuSnapshot {
  items: MenuItem[];
  cachedAt: string;
}

@Injectable()
export class MenuCacheService implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor(config: ConfigService) {
    const dbPath = config.get<string>(
      'MENU_CACHE_DB_PATH',
      './data/menu-cache.sqlite3',
    );
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS menu_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        cached_at TEXT NOT NULL
      )
    `);
  }

  getCachedMenu(): MenuSnapshot | null {
    const row = this.db
      .prepare('SELECT payload, cached_at FROM menu_cache WHERE id = 1')
      .get() as { payload: string; cached_at: string } | undefined;

    if (!row) {
      return null;
    }

    return { items: JSON.parse(row.payload), cachedAt: row.cached_at };
  }

  saveMenu(items: MenuItem[]): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO menu_cache (id, payload, cached_at) VALUES (1, ?, ?)',
      )
      .run(JSON.stringify(items), new Date().toISOString());
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
