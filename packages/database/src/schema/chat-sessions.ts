import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const chatSessions = pgTable(
  "chat_session",
  {
    id: typeId("id", "chat_session")
      .primaryKey()
      .$defaultFn(() => generateId("chat_session").toString()),
    discordUserId: text("discord_user_id").notNull(),
    discordChannelId: text("discord_channel_id").notNull(),
    lastMessageAt: timestamp("last_message_at", { mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("idx_chat_session_discord_user_id").on(t.discordUserId),
    index("idx_chat_session_discord_channel_id").on(t.discordChannelId),
    uniqueIndex("unique_chat_session_user_channel").on(
      t.discordUserId,
      t.discordChannelId,
    ),
  ],
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
