import { drizzle } from 'drizzle-orm/node-postgres';
import { RepositoryService } from './repositories';
import * as schema from './schema';

// For direct usage
const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}
export const db = drizzle(connectionString, { schema });

export type Database = typeof db;

// Repository service - centralized access to all repositories
export const repositories = new RepositoryService(db);

// Individual repository instances for backwards compatibility
export const modRepository = repositories.mods;
export const modDownloadRepository = repositories.modDownloads;
export const customSettingsRepository = repositories.customSettings;

export { sql } from 'drizzle-orm';

export * from './repositories';
export * from './schema';
export * as schema from './schema';
