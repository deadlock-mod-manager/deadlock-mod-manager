import { mapDrizzleError } from "@deadlock-mods/common";
import { count, eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import {
  messagePatterns,
  type NewMessagePattern,
  type NewTriageKeyword,
  triageKeywords,
} from "../schema/message-pattern-embeddings";
import { BaseRepository } from "./base";

export class MessagePatternRepository extends BaseRepository {
  async deleteAll() {
    try {
      await this.db.delete(messagePatterns);
      return ok(undefined);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to delete all message patterns");
      return err(mapDrizzleError(error));
    }
  }

  async createMany(patterns: Omit<NewMessagePattern, "id">[]) {
    try {
      const results = await this.db
        .insert(messagePatterns)
        .values(patterns)
        .returning();

      return ok(results);
    } catch (error) {
      this.logger.withError(error).error("Failed to create message patterns");
      return err(mapDrizzleError(error));
    }
  }

  async getCount() {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(messagePatterns);

      return ok(result[0]?.count ?? 0);
    } catch (error) {
      this.logger.withError(error).error("Failed to count message patterns");
      return err(mapDrizzleError(error));
    }
  }

  async findByPatternType(patternType: "bug_report" | "help_request") {
    try {
      const results = await this.db
        .select()
        .from(messagePatterns)
        .where(eq(messagePatterns.patternType, patternType));

      return ok(results);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ patternType })
        .error("Failed to find patterns by type");
      return err(mapDrizzleError(error));
    }
  }

  async findAll() {
    try {
      const results = await this.db.select().from(messagePatterns);
      return ok(results);
    } catch (error) {
      this.logger.withError(error).error("Failed to find all message patterns");
      return err(mapDrizzleError(error));
    }
  }
}

export class TriageKeywordRepository extends BaseRepository {
  async deleteAll() {
    try {
      await this.db.delete(triageKeywords);
      return ok(undefined);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to delete all triage keywords");
      return err(mapDrizzleError(error));
    }
  }

  async createMany(keywords: Omit<NewTriageKeyword, "id">[]) {
    try {
      const results = await this.db
        .insert(triageKeywords)
        .values(keywords)
        .onConflictDoNothing()
        .returning();

      return ok(results);
    } catch (error) {
      this.logger.withError(error).error("Failed to create triage keywords");
      return err(mapDrizzleError(error));
    }
  }

  async findAll() {
    try {
      const results = await this.db.select().from(triageKeywords);
      return ok(results);
    } catch (error) {
      this.logger.withError(error).error("Failed to find all triage keywords");
      return err(mapDrizzleError(error));
    }
  }
}
