import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const mods = pgTable('mod', {
  id: text('id').primaryKey().default(sql`concat('mod_', gen_random_uuid())`),
  remoteId: text('remote_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  remoteUrl: text('remote_url').notNull(),
  category: text('category').notNull(),
  likes: integer('likes').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  author: text('author').notNull(),
  downloadable: boolean('downloadable').notNull().default(false),
  remoteAddedAt: timestamp('remote_added_at', { mode: 'date' }).notNull(),
  remoteUpdatedAt: timestamp('remote_updated_at', { mode: 'date' }).notNull(),
  tags: text('tags').array().notNull(),
  images: text('images').array().notNull(),
  hero: text('hero'),
  isAudio: boolean('is_audio').notNull().default(false),
  audioUrl: text('audio_url'),
  downloadCount: integer('download_count').notNull().default(0),
  isNSFW: boolean('is_nsfw').notNull().default(false),
});

export const modDownloads = pgTable(
  'mod_download',
  {
    id: text('id')
      .primaryKey()
      .default(sql`concat('mod_download_', gen_random_uuid())`),
    modId: text('mod_id')
      .notNull()
      .references(() => mods.id),
    remoteId: text('remote_id').notNull(),
    file: text('file').notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    size: integer('size').notNull(),
  },
  (table) => [
    uniqueIndex('mod_download_mod_id_remote_id_idx').on(
      table.modId,
      table.remoteId
    ),
  ]
);

export const customSettings = pgTable('custom_setting', {
  id: text('id')
    .primaryKey()
    .default(sql`concat('custom_setting_', gen_random_uuid())`),
  key: text('key').notNull(),
  value: text('value').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Mod = typeof mods.$inferSelect;
export type NewMod = typeof mods.$inferInsert;

export type ModDownload = typeof modDownloads.$inferSelect;
export type NewModDownload = typeof modDownloads.$inferInsert;

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

export type CustomSetting = typeof customSettings.$inferSelect;
export type NewCustomSetting = typeof customSettings.$inferInsert;

export type JobLock = typeof jobLocks.$inferSelect;
export type NewJobLock = typeof jobLocks.$inferInsert;
