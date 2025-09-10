import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const jobLocks = pgTable('job_lock', {
  id: text('id')
    .primaryKey()
    .default(sql`concat('job_lock_', gen_random_uuid())`),
  jobName: text('job_name').notNull().unique(),
  lockedBy: text('locked_by').notNull(), // pod/instance identifier
  lockedAt: timestamp('locked_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  heartbeatAt: timestamp('heartbeat_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type JobLock = typeof jobLocks.$inferSelect;
export type NewJobLock = typeof jobLocks.$inferInsert;
