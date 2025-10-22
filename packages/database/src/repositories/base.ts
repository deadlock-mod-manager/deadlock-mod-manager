import type { Logger } from "@deadlock-mods/logging";
import type { Database } from "../client";

export class BaseRepository {
  protected readonly logger: Logger;
  constructor(
    protected readonly db: Database,
    logger: Logger,
  ) {
    this.logger = logger.child().withContext({
      repository: this.constructor.name,
    });
  }
}
