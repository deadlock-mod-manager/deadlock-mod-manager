import type { Logger as ChatLogger } from "chat";
import type { Logger } from "@deadlock-mods/logging";

export class ChatLoggerAdapter implements ChatLogger {
  constructor(private readonly logger: Logger) {}

  child(prefix: string): ChatLogger {
    return new ChatLoggerAdapter(this.logger.child().withContext({ prefix }));
  }

  debug(message: string, ..._args: unknown[]): void {
    this.logger.debug(message);
  }

  error(message: string, ..._args: unknown[]): void {
    this.logger.error(message);
  }

  info(message: string, ..._args: unknown[]): void {
    this.logger.info(message);
  }

  warn(message: string, ..._args: unknown[]): void {
    this.logger.warn(message);
  }
}
