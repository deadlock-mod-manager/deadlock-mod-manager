import { z } from "zod";

/*
 * The subset of the `dmm-source` 1.0 documents a hosted source publishes. The
 * desktop validates them again (`native_sources/validation.rs`); these
 * schemas describe the API's responses.
 */

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

/** No project is hosted yet, so the catalog has no listings. */
export const hostedSourceCatalogSchema = z.object({ items: z.tuple([]) });

export type HostedSourceDescriptor = z.infer<
  typeof hostedSourceDescriptorSchema
>;
export type HostedSourceCatalog = z.infer<typeof hostedSourceCatalogSchema>;

export const HOSTED_SOURCE_ID = "deadlock-mod-manager";
export const HOSTED_SOURCE_NAME = "Deadlock Mod Manager";

const ICON_URL = "https://deadlockmods.app/logo192.png";

/** The API's own origin keeps the download origins valid while nothing is hosted. */
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

export const hostedSourceCatalog: HostedSourceCatalog = { items: [] };
