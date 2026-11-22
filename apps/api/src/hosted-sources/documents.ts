import { z } from "zod";

export const hostedSourceDescriptorSchema = z.object({
  format: z.literal("dmm-source"),
  protocolVersion: z.literal("1.0"),
  sourceId: z.string(),
  name: z.string(),
  gameId: z.literal("deadlock"),
  homepageUrl: z.string(),
  iconUrl: z.string(),
  catalog: z.object({ kind: z.literal("static"), indexUrl: z.string() }),
  networkOrigins: z.object({
    api: z.array(z.string()),
    downloads: z.array(z.string()),
    media: z.array(z.string()),
  }),
  capabilities: z.object({ installationChoices: z.boolean() }),
});

export const hostedSourceCatalogSchema = z.object({
  snapshotId: z.string(),
  items: z.tuple([]),
});

export type HostedSourceDescriptor = z.infer<
  typeof hostedSourceDescriptorSchema
>;
export type HostedSourceCatalog = z.infer<typeof hostedSourceCatalogSchema>;

export const HOSTED_SOURCE_ID = "deadlock-mod-manager";
export const HOSTED_SOURCE_NAME = "Deadlock Mod Manager";

const ICON_URL = "https://deadlockmods.app/logo192.png";

export const buildHostedSourceDescriptor = (
  apiOrigin: string,
): HostedSourceDescriptor => ({
  format: "dmm-source",
  protocolVersion: "1.0",
  sourceId: HOSTED_SOURCE_ID,
  name: HOSTED_SOURCE_NAME,
  gameId: "deadlock",
  homepageUrl: "https://deadlockmods.app/",
  iconUrl: ICON_URL,
  catalog: { kind: "static", indexUrl: "./catalog.json" },
  networkOrigins: {
    api: [apiOrigin],
    downloads: [apiOrigin],
    media: [new URL(ICON_URL).origin],
  },
  capabilities: { installationChoices: true },
});

export const hostedSourceCatalog: HostedSourceCatalog = {
  snapshotId: "empty",
  items: [],
};
