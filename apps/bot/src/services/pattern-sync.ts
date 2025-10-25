import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RuntimeError } from "@deadlock-mods/common";
import {
  db,
  MessagePatternRepository,
  TriageKeywordRepository,
} from "@deadlock-mods/database";
import { OpenAIEmbeddings } from "@langchain/openai";
import { err, ok } from "neverthrow";
import xxhash from "xxhash-wasm";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "pattern-sync-service",
});

interface ParsedPatterns {
  bugReportPatterns: string[];
  helpRequestPatterns: string[];
  keywords: string[];
}

export class PatternSyncService {
  private embeddings: OpenAIEmbeddings;
  private patternRepository: MessagePatternRepository;
  private keywordRepository: TriageKeywordRepository;
  private patternsFilePath: string;
  private lastContentHash: string | null = null;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    this.patternRepository = new MessagePatternRepository(db, logger);
    this.keywordRepository = new TriageKeywordRepository(db, logger);
    this.patternsFilePath = join(__dirname, "../ai/prompts/triage-patterns.md");
  }

  private async loadPatternsFile() {
    try {
      const content = await readFile(this.patternsFilePath, "utf-8");
      return ok(content);
    } catch (error) {
      logger.withError(error).error("Failed to load patterns file");
      return err(
        new RuntimeError("Failed to load patterns file", {
          cause: error,
        }),
      );
    }
  }

  private async computeHash(content: string) {
    try {
      const hasher = await xxhash();
      const hash = hasher.h64ToString(content);
      return ok(hash);
    } catch (error) {
      logger.withError(error).error("Failed to compute hash");
      return err(
        new RuntimeError("Failed to compute hash", {
          cause: error,
        }),
      );
    }
  }

  private parsePatterns(content: string): ParsedPatterns {
    const bugReportPatterns: string[] = [];
    const helpRequestPatterns: string[] = [];
    const keywords: string[] = [];

    const lines = content.split("\n");
    let currentSection: "bug" | "help" | "keywords" | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("## Bug Report Patterns")) {
        currentSection = "bug";
        continue;
      }
      if (trimmed.startsWith("## Help Request Patterns")) {
        currentSection = "help";
        continue;
      }
      if (trimmed.startsWith("## Keywords")) {
        currentSection = "keywords";
        continue;
      }

      if (trimmed.startsWith("##")) {
        currentSection = null;
        continue;
      }

      if (currentSection === "bug" && trimmed.startsWith("- ")) {
        bugReportPatterns.push(trimmed.slice(2));
      } else if (currentSection === "help" && trimmed.startsWith("- ")) {
        helpRequestPatterns.push(trimmed.slice(2));
      } else if (currentSection === "keywords" && trimmed.length > 0) {
        const kw = trimmed
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        keywords.push(...kw);
      }
    }

    return {
      bugReportPatterns,
      helpRequestPatterns,
      keywords: [...new Set(keywords)],
    };
  }

  async sync() {
    logger.info("Starting pattern sync");

    const contentResult = await this.loadPatternsFile();
    if (contentResult.isErr()) {
      logger.withError(contentResult.error).error("Pattern sync failed");
      throw contentResult.error;
    }

    const content = contentResult.value;
    const hashResult = await this.computeHash(content);
    if (hashResult.isErr()) {
      logger.withError(hashResult.error).error("Pattern sync failed");
      throw hashResult.error;
    }

    const contentHash = hashResult.value;

    if (this.lastContentHash === contentHash) {
      logger.info("Patterns have not changed, skipping sync");
      return {
        success: true,
        patternsProcessed: 0,
        keywordsProcessed: 0,
        skipped: true,
        message: "Patterns have not changed",
      };
    }

    logger
      .withMetadata({ contentHash, contentLength: content.length })
      .info("Parsing patterns");

    const parsed = this.parsePatterns(content);

    logger
      .withMetadata({
        bugReportPatterns: parsed.bugReportPatterns.length,
        helpRequestPatterns: parsed.helpRequestPatterns.length,
        keywords: parsed.keywords.length,
      })
      .info("Parsed patterns from file");

    try {
      const allPatterns = [
        ...parsed.bugReportPatterns.map((p) => ({
          type: "bug_report" as const,
          text: p,
        })),
        ...parsed.helpRequestPatterns.map((p) => ({
          type: "help_request" as const,
          text: p,
        })),
      ];

      logger.info("Generating embeddings for patterns");
      const embeddings = await this.embeddings.embedDocuments(
        allPatterns.map((p) => p.text),
      );

      logger.info("Deleting old patterns");
      const deletePatternResult = await this.patternRepository.deleteAll();
      if (deletePatternResult.isErr()) {
        throw deletePatternResult.error;
      }

      logger.info("Inserting new patterns");
      const patternRecords = allPatterns.map((pattern, index) => ({
        patternType: pattern.type,
        patternText: pattern.text,
        embedding: embeddings[index],
        metadata: { source: "triage-patterns.md" },
      }));

      const createPatternResult =
        await this.patternRepository.createMany(patternRecords);
      if (createPatternResult.isErr()) {
        throw createPatternResult.error;
      }

      logger.info("Deleting old keywords");
      const deleteKeywordResult = await this.keywordRepository.deleteAll();
      if (deleteKeywordResult.isErr()) {
        throw deleteKeywordResult.error;
      }

      logger.info("Inserting new keywords");
      const keywordRecords = parsed.keywords.map((keyword) => ({
        keyword: keyword.toLowerCase(),
      }));

      const createKeywordResult =
        await this.keywordRepository.createMany(keywordRecords);
      if (createKeywordResult.isErr()) {
        throw createKeywordResult.error;
      }

      this.lastContentHash = contentHash;

      logger
        .withMetadata({
          patternsProcessed: allPatterns.length,
          keywordsProcessed: parsed.keywords.length,
        })
        .info("Pattern sync completed successfully");

      return {
        success: true,
        patternsProcessed: allPatterns.length,
        keywordsProcessed: parsed.keywords.length,
        skipped: false,
        message: `Successfully synced ${allPatterns.length} patterns and ${parsed.keywords.length} keywords`,
      };
    } catch (error) {
      logger.withError(error).error("Failed to sync patterns");
      throw error;
    }
  }

  async syncPeriodically(intervalHours: number) {
    await this.sync();

    setInterval(
      async () => {
        try {
          await this.sync();
        } catch (error) {
          logger
            .withError(error)
            .error("Periodic pattern sync failed, will retry next interval");
        }
      },
      intervalHours * 60 * 60 * 1000,
    );
  }
}
