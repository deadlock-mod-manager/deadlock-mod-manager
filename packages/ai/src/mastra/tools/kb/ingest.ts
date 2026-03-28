import { embed } from "ai";
import type { AiConfig } from "../../../config";
import { createServiceLogger } from "../../../logger";
import { createKbVectorDeps } from "./vector-store";

const log = createServiceLogger("kb-ingest");

interface KbMessageMetadata {
  messageId: string;
  authorId: string;
  channelId: string;
  timestamp: string;
}

export async function ingestKbMessage(
  config: AiConfig,
  text: string,
  metadata: KbMessageMetadata,
): Promise<void> {
  if (!text || text.trim().length < 20) {
    log.debug("Skipping KB message: too short");
    return;
  }

  const { vectorStore, embeddingModel, INDEX_NAME, EMBEDDING_DIMENSION } =
    createKbVectorDeps(config);

  const existingIndexes = await vectorStore.listIndexes();
  if (!existingIndexes.includes(INDEX_NAME)) {
    await vectorStore.createIndex({
      indexName: INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
    });
  }

  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });

  await vectorStore.upsert({
    indexName: INDEX_NAME,
    vectors: [embedding],
    metadata: [
      {
        text,
        messageId: metadata.messageId,
        authorId: metadata.authorId,
        channelId: metadata.channelId,
        timestamp: metadata.timestamp,
      },
    ],
  });

  log.info(`Ingested KB message ${metadata.messageId}`);
}
