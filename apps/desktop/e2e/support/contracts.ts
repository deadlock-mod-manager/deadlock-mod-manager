import { z } from "zod";

export type ServiceName =
  | "gamebanana"
  | "downloads"
  | "dmmApi"
  | "auth"
  | "deadlockApi"
  | "assets";

export const SERVICE_NAMES: readonly ServiceName[] = [
  "gamebanana",
  "downloads",
  "dmmApi",
  "auth",
  "deadlockApi",
  "assets",
];

export type DriverProvider = "embedded" | "external";

export type E2eRoots = {
  world: string;
  game: string;
  steam: string;
  steamHttpCache: string;
  appData: string;
  appConfig: string;
  appCache: string;
  appLogs: string;
  webviewData: string;
  temporary: string;
};

export type E2eConfiguration = {
  schemaVersion: 1;
  runId: string;
  caseId: string;
  attempt: number;
  applicationIdentity: string;
  roots: E2eRoots;
  endpoints: Array<{ service: ServiceName; origin: string }>;
  networkMode: "fixture";
  integrations: {
    updater: "disabled" | "fixture";
    steamDiscovery: "fixture";
    gameLaunch: "record";
    presence: "disabled";
    ingestion: "disabled";
    matchSync: "disabled";
  };
  ui: { language: string; width: number; height: number };
  control: { endpoint: string; tokenFile: string };
};

export type WorldManifest = {
  schemaVersion: 1;
  owner: "dmm-e2e-harness";
  createdAt: string;
  expiresAt: string;
  processId: number;
  configuration: E2eConfiguration;
};

const rootsSchema = z.object({
  world: z.string(),
  game: z.string(),
  steam: z.string(),
  steamHttpCache: z.string(),
  appData: z.string(),
  appConfig: z.string(),
  appCache: z.string(),
  appLogs: z.string(),
  webviewData: z.string(),
  temporary: z.string(),
});

const configurationSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  caseId: z.string(),
  attempt: z.number().int().positive(),
  applicationIdentity: z.string(),
  roots: rootsSchema,
  endpoints: z.array(
    z.object({
      service: z.enum([
        "gamebanana",
        "downloads",
        "dmmApi",
        "auth",
        "deadlockApi",
        "assets",
      ]),
      origin: z.string(),
    }),
  ),
  networkMode: z.literal("fixture"),
  integrations: z.object({
    updater: z.enum(["disabled", "fixture"]),
    steamDiscovery: z.literal("fixture"),
    gameLaunch: z.literal("record"),
    presence: z.literal("disabled"),
    ingestion: z.literal("disabled"),
    matchSync: z.literal("disabled"),
  }),
  ui: z.object({
    language: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  control: z.object({ endpoint: z.string(), tokenFile: z.string() }),
});

export const worldManifestSchema = z.object({
  schemaVersion: z.literal(1),
  owner: z.literal("dmm-e2e-harness"),
  createdAt: z.string(),
  expiresAt: z.string(),
  processId: z.number().int(),
  configuration: configurationSchema,
});
