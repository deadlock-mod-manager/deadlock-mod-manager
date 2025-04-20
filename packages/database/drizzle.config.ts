import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load environment variables from root .env file
dotenv.config({ path: '../../.env' });

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
} satisfies Config; 