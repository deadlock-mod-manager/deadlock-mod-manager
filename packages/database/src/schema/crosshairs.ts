import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { user } from "./auth";
import { timestamps } from "./shared/timestamps";

export const crosshairs = pgTable(
  "crosshair",
  {
    id: typeId("id", "crosshair")
      .primaryKey()
      .$defaultFn(() => generateId("crosshair").toString()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    config: jsonb("config").notNull(),
    tags: text("tags").array().notNull().default([]),
    heroes: text("heroes").array().notNull().default([]),
    likes: integer("likes").notNull().default(0),
    downloads: integer("downloads").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("idx_crosshair_created_at").on(table.createdAt),
    index("idx_crosshair_likes").on(table.likes),
    index("idx_crosshair_downloads").on(table.downloads),
    index("idx_crosshair_user_id").on(table.userId),
  ],
);

export const crosshairLikes = pgTable(
  "crosshair_like",
  {
    id: typeId("id", "crosshair_like")
      .primaryKey()
      .$defaultFn(() => generateId("crosshair_like").toString()),
    crosshairId: text("crosshair_id")
      .notNull()
      .references(() => crosshairs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crosshair_like_crosshair_id_user_id_idx").on(
      table.crosshairId,
      table.userId,
    ),
    index("idx_crosshair_like_user_id").on(table.userId),
  ],
);

export type Crosshair = typeof crosshairs.$inferSelect;
export type NewCrosshair = typeof crosshairs.$inferInsert;

export type CrosshairLike = typeof crosshairLikes.$inferSelect;
export type NewCrosshairLike = typeof crosshairLikes.$inferInsert;
