import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load environment variables from root .env file
dotenv.config({ path: '../../.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
