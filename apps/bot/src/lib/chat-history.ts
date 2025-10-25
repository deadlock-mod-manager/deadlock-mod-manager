import {
  ChatMessageRepository,
  db,
  type MessageType,
} from "@deadlock-mods/database";
import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { logger } from "./logger";

export class DrizzleChatMessageHistory extends BaseChatMessageHistory {
  private readonly repository: ChatMessageRepository;
  private readonly userId: string;
  private readonly channelId: string;
  private sessionId: string | null = null;
  private sessionInitPromise: Promise<void> | null = null;

  lc_namespace = ["@deadlock-mods/bot", "lib", "chat-history"];

  constructor(userId: string, channelId: string) {
    super();
    this.repository = new ChatMessageRepository(db, logger);
    this.userId = userId;
    this.channelId = channelId;
    this.sessionInitPromise = this.ensureSession();
  }

  async getMessages(): Promise<BaseMessage[]> {
    await this.sessionInitPromise;

    const messages = await this.repository.getMessages(this.sessionId!);

    return messages.map((msg) => {
      const content = msg.content;
      switch (msg.type) {
        case "human":
          return new HumanMessage(content);
        case "ai":
          return new AIMessage(content);
        case "system":
          return new SystemMessage(content);
        default:
          return new HumanMessage(content);
      }
    });
  }

  async addMessage(message: BaseMessage): Promise<void> {
    await this.sessionInitPromise;

    let type: MessageType;
    if (message instanceof HumanMessage) {
      type = "human";
    } else if (message instanceof AIMessage) {
      type = "ai";
    } else if (message instanceof SystemMessage) {
      type = "system";
    } else {
      type = "human";
    }

    const metadata: Record<string, unknown> = {};
    if (
      message instanceof AIMessage &&
      "kwargs" in message &&
      message.kwargs &&
      typeof message.kwargs === "object" &&
      "additional_kwargs" in message.kwargs
    ) {
      const kwargs = message.kwargs as {
        additional_kwargs?: Record<string, unknown>;
      };
      if (kwargs.additional_kwargs) {
        metadata.additionalKwargs = kwargs.additional_kwargs;
        if (kwargs.additional_kwargs.response_metadata) {
          metadata.responseMetadata =
            kwargs.additional_kwargs.response_metadata;
        }
      }
    }

    const contentString =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    await this.repository.addMessage(
      this.sessionId!,
      type,
      contentString,
      metadata,
    );
  }

  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage(message));
  }

  async addAIMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage(message));
  }

  async clear(): Promise<void> {
    await this.sessionInitPromise;

    await this.repository.clearMessages(this.sessionId!);
  }

  private async ensureSession(): Promise<void> {
    if (!this.sessionId) {
      this.sessionId = await this.repository.findOrCreateSession(
        this.userId,
        this.channelId,
      );
      logger
        .withMetadata({
          userId: this.userId,
          channelId: this.channelId,
          sessionId: this.sessionId,
        })
        .debug("Chat session initialized");
    }
  }
}
