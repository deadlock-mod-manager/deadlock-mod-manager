import { createMastra, ingestDocs } from "@deadlock-mods/ai";
import {
  MastraServer,
  type HonoBindings,
  type HonoVariables,
} from "@mastra/hono";
import type { Hono } from "hono";
import { env } from "@/lib/env";
import { logger, runWithWideEvent, wideEventContext } from "@/lib/logger";

export type MastraAppEnv = { Bindings: HonoBindings; Variables: HonoVariables };

export async function initializeMastra(app: Hono<MastraAppEnv>): Promise<void> {
  const mastra = await createMastra(env);
  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();
}

export function scheduleDocsIngest(): void {
  void runWithWideEvent(
    wideEventContext,
    logger,
    "docs_ingest",
    { service: "docs-ingest" },
    async (wide) => {
      await ingestDocs(env);
      wide.merge({ docsIngestOutcome: "complete" });
    },
  ).catch(() => {});
}
