import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// For direct usage
const connectionString = process.env.DATABASE_URL || '';
export const db = drizzle(connectionString, { schema });

// Types re-export
export * from './schema';
