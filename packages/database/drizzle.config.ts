import { ConfigurationError } from "@deadlock-mods/common";
import * as dotenv from "dotenv";
import type { Config } from "drizzle-kit";

dotenv.config({ path: "../../.env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new ConfigurationError("DATABASE_URL environment variable is required");
}

export default {
  schema: "./src/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
