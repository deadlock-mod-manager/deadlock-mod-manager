import { createMastra, ingestDocs } from "@deadlock-mods/ai";
import {
  MastraServer,
  type HonoBindings,
  type HonoVariables,
} from "@mastra/hono";
import type { Hono } from "hono";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type MastraAppEnv = { Bindings: HonoBindings; Variables: HonoVariables };

export async function initializeMastra(app: Hono<MastraAppEnv>): Promise<void> {
  const mastra = await createMastra(env);
  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();
}

export function scheduleDocsIngest(): void {
  const docsIngestLogger = logger.child().withContext({
    service: "docs-ingest",
  });
  ingestDocs(env)
    .then(() => docsIngestLogger.info("Docs ingestion complete"))
    .catch((err) =>
      docsIngestLogger
        .withError(err instanceof Error ? err : new Error(String(err)))
        .warn("Docs ingestion failed, searchDocsTool may return empty results"),
    );
}
