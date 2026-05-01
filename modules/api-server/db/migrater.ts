import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db as drizzleDb } from './index';

export async function runMigrate() {
  try {
    await migrate(drizzleDb, { migrationsFolder: './db/migrations' });
  } catch (e) {
    console.error('Migration failed:', e);
  }
}
