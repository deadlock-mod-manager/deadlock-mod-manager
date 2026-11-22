import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const jobLocks = pgTable("job_lock", {
  id: typeId("id", "job_lock")
    .primaryKey()
    .$defaultFn(() => generateId("job_lock").toString()),
  jobName: text("job_name").notNull().unique(),
  lockedBy: text("locked_by").notNull(), // pod/instance identifier
  lockedAt: timestamp("locked_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  heartbeatAt: timestamp("heartbeat_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  ...timestamps,
});

export type JobLock = typeof jobLocks.$inferSelect;
export type NewJobLock = typeof jobLocks.$inferInsert;
