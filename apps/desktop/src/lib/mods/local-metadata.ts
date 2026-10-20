import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, readTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";
import { ModCategory } from "@/lib/constants";
import { getRuntimeBootstrap } from "@/lib/runtime-bootstrap";

const metadataSchema = z.object({
  id: z.string(),
  kind: z.literal("local"),
  name: z.string().trim().min(1),
  author: z.string().optional(),
  description: z.string().nullish(),
  link: z.string().nullish(),
  category: z.string().nullish(),
});

export const readLocalModMetadata = async (modId: string) => {
  // Local IDs also include Foundry's timestamp IDs; never accept path segments.
  if (!/^local-[a-zA-Z0-9_-]+$/.test(modId)) {
    throw new Error("Invalid local mod ID");
  }
  const base =
    (await getRuntimeBootstrap()).appDataPath ?? (await appLocalDataDir());
  const metadata = metadataSchema.parse(
    JSON.parse(
      await readTextFile(await join(base, "mods", modId, "metadata.json"), {
        baseDir: BaseDirectory.AppLocalData,
      }),
    ),
  );
  if (metadata.id !== modId) {
    throw new Error("Local mod metadata ID mismatch");
  }
  return {
    name: metadata.name,
    author: metadata.author ?? "",
    description: metadata.description ?? null,
    remoteUrl: metadata.link ?? "local://manual",
    category: metadata.category ?? "local",
    isMap: metadata.category === ModCategory.MAPS,
  };
};
