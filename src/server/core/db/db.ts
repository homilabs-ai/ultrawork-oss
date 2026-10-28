import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { schema } from "./schema.ts";

export type DB = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR || join(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle");

export interface OpenedDb {
  db: DB;
  sqlite: Database;
}

export function openDb(path: string): OpenedDb {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite };
}
