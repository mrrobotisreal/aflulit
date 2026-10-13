import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as schema from '../schema';
import type { AflulitDB } from '../types';

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
);

/**
 * Fresh in-memory database with ALL migrations applied from empty — every
 * test exercises the exact .sql files the device runs (including the FTS5
 * migration). The better-sqlite3 instance is cast to the shared AflulitDB
 * handle; drizzle builders are thenable on the sync driver, so awaiting
 * works identically to the expo driver (see src/db/types.ts).
 */
export function createTestDb(): AflulitDB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db as unknown as AflulitDB;
}
