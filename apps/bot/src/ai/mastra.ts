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

let disconnectAllMcps: (() => Promise<void>) | null = null;

export async function initializeMastra(app: Hono<MastraAppEnv>): Promise<void> {
  const { mastra, disconnectAllMcps: registerDisconnectAllMcps } =
    await createMastra(env);
  disconnectAllMcps = registerDisconnectAllMcps;
  const mastraServer = new MastraServer({ app, mastra });
  await mastraServer.init();
}

export async function disconnectMcps(): Promise<void> {
  await disconnectAllMcps?.();
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
