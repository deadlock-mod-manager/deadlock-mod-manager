import { RuntimeError } from "@deadlock-mods/common";
import {
  DocumentationChunkRepository,
  DocumentationSyncRepository,
  db,
} from "@deadlock-mods/database";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { err, ok } from "neverthrow";
import xxhash from "xxhash-wasm";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface SyncResult {
  success: boolean;
  chunksProcessed: number;
  contentHash: string;
  skipped: boolean;
  message: string;
}

export class DocumentationSyncService {
  private embeddings: OpenAIEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;
  private syncRepository: DocumentationSyncRepository;
  private chunkRepository: DocumentationChunkRepository;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    this.textSplitter = RecursiveCharacterTextSplitter.fromLanguage(
      "markdown",
      {
        chunkSize: 1000,
        chunkOverlap: 200,
      },
    );

    this.syncRepository = new DocumentationSyncRepository(db, logger);
    this.chunkRepository = new DocumentationChunkRepository(db, logger);
  }

  private async fetchDocumentation() {
    try {
      const response = await fetch(env.DOCS_URL);
      if (!response.ok) {
        return err(
          new RuntimeError(
            `Failed to fetch documentation: ${response.statusText}`,
          ),
        );
      }
      const text = await response.text();
      return ok(text);
    } catch (error) {
      logger.withError(error).error("Failed to fetch documentation");
      return err(new RuntimeError("Failed to fetch documentation", error));
    }
  }

  private async computeHash(content: string) {
    try {
      const hasher = await xxhash();
      const hash = hasher.h64ToString(content);
      return ok(hash);
    } catch (error) {
      logger.withError(error).error("Failed to compute hash");
      return err(new RuntimeError("Failed to compute hash", error));
    }
  }

  private async checkIfSyncNeeded(contentHash: string) {
    const result = await this.syncRepository.findFirst();

    if (result.isErr()) {
      return result;
    }

    if (result.value === null) {
      return ok(true);
    }

    return ok(result.value.contentHash !== contentHash);
  }

  private async updateSyncStatus(
    status: "idle" | "syncing" | "error",
    contentHash: string,
    chunkCount: number,
    errorMessage?: string,
  ) {
    return this.syncRepository.upsert({
      status,
      contentHash,
      chunkCount,
      lastSyncedAt: new Date(),
      errorMessage: errorMessage || null,
    });
  }

  async sync() {
    logger.info("Starting documentation sync");

    const contentResult = await this.fetchDocumentation();
    if (contentResult.isErr()) {
      logger.withError(contentResult.error).error("Documentation sync failed");
      throw contentResult.error;
    }

    const content = contentResult.value;
    const hashResult = await this.computeHash(content);
    if (hashResult.isErr()) {
      logger.withError(hashResult.error).error("Documentation sync failed");
      throw hashResult.error;
    }

    const contentHash = hashResult.value;
    logger
      .withMetadata({ contentHash, contentLength: content.length })
      .info("Computed content hash");

    const syncNeededResult = await this.checkIfSyncNeeded(contentHash);
    if (syncNeededResult.isErr()) {
      logger
        .withError(syncNeededResult.error)
        .error("Documentation sync failed");
      throw syncNeededResult.error;
    }

    const syncNeeded = syncNeededResult.value;
    if (!syncNeeded) {
      logger.info("Documentation has not changed, skipping sync");
      return {
        success: true,
        chunksProcessed: 0,
        contentHash,
        skipped: true,
        message: "Documentation has not changed",
      };
    }

    logger.info("Documentation has changed, starting sync");

    const updateStatusResult = await this.updateSyncStatus(
      "syncing",
      contentHash,
      0,
    );
    if (updateStatusResult.isErr()) {
      logger
        .withError(updateStatusResult.error)
        .error("Failed to update sync status");
      throw updateStatusResult.error;
    }

    try {
      const chunks = await this.textSplitter.createDocuments([content]);
      logger
        .withMetadata({ chunkCount: chunks.length })
        .info("Split documentation into chunks");

      logger.info("Generating embeddings for chunks");
      const embeddings = await this.embeddings.embedDocuments(
        chunks.map((chunk) => chunk.pageContent),
      );

      logger.info("Deleting old chunks");
      const deleteResult = await this.chunkRepository.deleteAll();
      if (deleteResult.isErr()) {
        throw deleteResult.error;
      }

      logger.info("Inserting new chunks");
      const chunkRecords = chunks.map((chunk, index) => ({
        content: chunk.pageContent,
        embedding: embeddings[index],
        metadata: {
          chunkIndex: index,
          startChar: (chunk.metadata.loc?.lines?.from as number) || 0,
          endChar: (chunk.metadata.loc?.lines?.to as number) || 0,
        },
      }));

      const BATCH_SIZE = 100;
      for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
        const batch = chunkRecords.slice(i, i + BATCH_SIZE);
        const createResult = await this.chunkRepository.createMany(batch);
        if (createResult.isErr()) {
          throw createResult.error;
        }
        logger
          .withMetadata({
            progress: `${i + batch.length}/${chunkRecords.length}`,
          })
          .info("Inserted batch of chunks");
      }

      const finalUpdateResult = await this.updateSyncStatus(
        "idle",
        contentHash,
        chunks.length,
      );
      if (finalUpdateResult.isErr()) {
        logger
          .withError(finalUpdateResult.error)
          .error("Failed to update final sync status");
        throw finalUpdateResult.error;
      }

      return {
        success: true,
        chunksProcessed: chunks.length,
        contentHash,
        skipped: false,
        message: `Successfully synced ${chunks.length} chunks`,
      };
    } catch (error) {
      logger.withError(error).error("Failed to sync documentation");
      const errorUpdateResult = await this.updateSyncStatus(
        "error",
        contentHash,
        0,
        error instanceof Error ? error.message : String(error),
      );
      if (errorUpdateResult.isErr()) {
        logger
          .withError(errorUpdateResult.error)
          .error("Failed to update error sync status");
      }
      throw error;
    }
  }
}
