import { and, eq } from "drizzle-orm";
import {
  type ChatMessage,
  chatMessages,
  chatSessions,
  type MessageType,
} from "../schema";
import { BaseRepository } from "./base";

export class ChatMessageRepository extends BaseRepository {
  async findOrCreateSession(
    userId: string,
    channelId: string,
  ): Promise<string> {
    const existing = await this.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.discordUserId, userId),
          eq(chatSessions.discordChannelId, channelId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const newSession = await this.db
      .insert(chatSessions)
      .values({
        discordUserId: userId,
        discordChannelId: channelId,
        lastMessageAt: new Date(),
      })
      .returning();

    return newSession[0].id;
  }

  async addMessage(
    sessionId: string,
    type: MessageType,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(chatMessages).values({
      sessionId,
      type,
      content,
      metadata: metadata || null,
    });

    await this.db
      .update(chatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }

  async getMessages(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    const query = this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    if (limit) {
      return await query.limit(limit);
    }

    return await query;
  }

  async clearMessages(sessionId: string): Promise<void> {
    await this.db
      .delete(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId));
  }

  async updateSessionTimestamp(sessionId: string): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }
}
