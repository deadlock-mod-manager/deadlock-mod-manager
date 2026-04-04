import { LogLevel, type ILogger } from "@sapphire/framework";
import type { Logger } from "@deadlock-mods/logging";

function formatValues(values: readonly unknown[]): string {
  return values.map((v) => String(v)).join(" ");
}

export class SapphireLoggerAdapter implements ILogger {
  public level = LogLevel.Info;

  constructor(private readonly logger: Logger) {}

  has(level: LogLevel): boolean {
    return level >= this.level;
  }

  trace(...values: readonly unknown[]): void {
    this.logger.trace(formatValues(values));
  }

  debug(...values: readonly unknown[]): void {
    this.logger.debug(formatValues(values));
  }

  info(...values: readonly unknown[]): void {
    this.logger.info(formatValues(values));
  }

  warn(...values: readonly unknown[]): void {
    this.logger.warn(formatValues(values));
  }

  error(...values: readonly unknown[]): void {
    this.logger.error(formatValues(values));
  }

  fatal(...values: readonly unknown[]): void {
    this.logger.fatal(formatValues(values));
  }

  write(level: LogLevel, ...values: readonly unknown[]): void {
    switch (level) {
      case LogLevel.Trace:
        this.trace(...values);
        break;
      case LogLevel.Debug:
        this.debug(...values);
        break;
      case LogLevel.Info:
        this.info(...values);
        break;
      case LogLevel.Warn:
        this.warn(...values);
        break;
      case LogLevel.Error:
        this.error(...values);
        break;
      case LogLevel.Fatal:
        this.fatal(...values);
        break;
      case LogLevel.None:
        break;
    }
  }
}
