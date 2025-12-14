import { mapDrizzleError } from "@deadlock-mods/common";
import { count } from "@deadlock-mods/database";
import { err, ok } from "neverthrow";
import {
  documentationChunks,
  type NewDocumentationChunk,
} from "../schema/documentation";
import { BaseRepository } from "./base";

export class DocumentationChunkRepository extends BaseRepository {
  async deleteAll() {
    try {
      await this.db.delete(documentationChunks);
      return ok(undefined);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to delete all documentation chunks");
      return err(mapDrizzleError(error));
    }
  }

  async createMany(chunks: Omit<NewDocumentationChunk, "id">[]) {
    try {
      const results = await this.db
        .insert(documentationChunks)
        .values(chunks)
        .returning();

      return ok(results);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to create documentation chunks");
      return err(mapDrizzleError(error));
    }
  }

  async getCount() {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(documentationChunks);

      return ok(result[0]?.count ?? 0);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to count documentation chunks");
      return err(mapDrizzleError(error));
    }
  }
}
