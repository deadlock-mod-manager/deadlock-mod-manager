import { mapDrizzleError } from "@deadlock-mods/common";
import { eq } from "@deadlock-mods/database";
import { err, ok } from "neverthrow";
import {
  documentationSync,
  type NewDocumentationSync,
} from "../schema/documentation";
import { BaseRepository } from "./base";

export class DocumentationSyncRepository extends BaseRepository {
  async findFirst() {
    try {
      const results = await this.db.select().from(documentationSync).limit(1);

      if (results.length === 0) {
        return ok(null);
      }

      return ok(results[0]);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to find documentation sync status");
      return err(mapDrizzleError(error));
    }
  }

  async create(data: Omit<NewDocumentationSync, "id">) {
    try {
      const [result] = await this.db
        .insert(documentationSync)
        .values(data)
        .returning();

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to create documentation sync status");
      return err(mapDrizzleError(error));
    }
  }

  async update(id: string, data: Partial<NewDocumentationSync>) {
    try {
      const [result] = await this.db
        .update(documentationSync)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(documentationSync.id, id))
        .returning();

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to update documentation sync status");
      return err(mapDrizzleError(error));
    }
  }

  async upsert(data: Omit<NewDocumentationSync, "id">) {
    try {
      const existingResult = await this.findFirst();

      if (existingResult.isErr()) {
        return existingResult;
      }

      if (existingResult.value === null) {
        return this.create(data);
      }

      return this.update(existingResult.value.id, data);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to upsert documentation sync status");
      return err(mapDrizzleError(error));
    }
  }
}
