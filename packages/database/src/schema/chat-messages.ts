import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { chatSessions } from "./chat-sessions";
import { timestamps } from "./shared/timestamps";

export const messageTypeEnum = pgEnum("message_type", [
  "human",
  "ai",
  "system",
]);

export const chatMessages = pgTable(
  "chat_message",
  {
    id: typeId("id", "chat_message")
      .primaryKey()
      .$defaultFn(() => generateId("chat_message").toString()),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    type: messageTypeEnum("type").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (t) => [
    index("idx_chat_message_session_created").on(t.sessionId, t.createdAt),
  ],
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type MessageType = "human" | "ai" | "system";
