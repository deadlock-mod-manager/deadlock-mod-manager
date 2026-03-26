import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { user } from "./auth";
import { timestamps } from "./shared/timestamps";

export const authorVerification = pgTable(
  "author_verification",
  {
    id: typeId("id", "author_verification")
      .primaryKey()
      .$defaultFn(() => generateId("author_verification").toString()),
    discordUserId: text("discord_user_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    gamebananaMemberId: integer("gamebanana_member_id").notNull(),
    gamebananaUsername: text("gamebanana_username").notNull(),
    verificationCode: text("verification_code").notNull(),
    status: text("status", {
      enum: ["pending", "verified", "expired"],
    }).notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_author_verification_gb_member").on(
      table.gamebananaMemberId,
    ),
    index("idx_author_verification_discord_user").on(table.discordUserId),
    index("idx_author_verification_status").on(table.status),
  ],
);

export type AuthorVerification = typeof authorVerification.$inferSelect;
export type NewAuthorVerification = typeof authorVerification.$inferInsert;
