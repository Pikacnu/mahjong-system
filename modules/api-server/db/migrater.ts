import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db as drizzleDb } from './index';

export async function runMigrate() {
  await migrate(drizzleDb, { migrationsFolder: './db/migrations' });
}
