import { ConfigurationError } from "@deadlock-mods/common";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "";
if (!connectionString) {
  throw new ConfigurationError("DATABASE_URL environment variable is required");
}

export const db = drizzle(connectionString, { schema });
export type Database = typeof db;

export * from "drizzle-orm";
export * from "./repositories";
export * from "./schema";
export * as schema from "./schema";
