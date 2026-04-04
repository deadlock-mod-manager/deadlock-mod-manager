export type { Agent } from "@mastra/core/agent";
export { aiConfigSchema, type AiConfig } from "./config";
export { createMastra } from "./mastra";
export { ingestDocs } from "./mastra/tools/docs";
export { ingestKbMessage } from "./mastra/tools/kb";
