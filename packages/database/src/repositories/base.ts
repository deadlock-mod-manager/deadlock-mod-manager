import type { Logger } from "@deadlock-mods/logging";
import type { Database } from "../client";

export class BaseRepository {
  constructor(
    protected readonly db: Database,
    protected readonly logger: Logger,
  ) {}
}
