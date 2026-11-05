import { invoke } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { renderModelThumbnail } from "@/components/foundry/model-thumbnail";
import { resolveModVpk } from "./foundry";
import { decodeFoundryModel, releaseFoundryModel } from "./model-assets";
import { previewCaptureQueue } from "./preview-work-queue";
import type { ModPreviewInfo } from "@/types/generated/ModPreviewInfo";
import type { LocalMod } from "@/types/mods";

const memory = new Map<string, string>();
const MAX_MEMORY_IMAGES = 64;
type ThumbnailMod = Pick<LocalMod, "remoteId" | "installedVpks">;

const remember = (identity: string, image: string) => {
  memory.delete(identity);
  memory.set(identity, image);
  if (memory.size > MAX_MEMORY_IMAGES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  return image;
};

const localModThumbnail = async (
  mod: ThumbnailMod,
  profileFolder: string | null,
  signal: AbortSignal,
): Promise<string | null> => {
  // Local imports have a unique id. Deployment paths and enablement are not
  // revisions of their cover: read the saved image before resolving any VPK.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`dmm-local-cover-1:${mod.remoteId}`),
  );
  const identity = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  signal.throwIfAborted();
  const cached = memory.get(identity);
  if (cached) return remember(identity, cached);
  return previewCaptureQueue.run(async () => {
    const existing =
      memory.get(identity) ??
      (await invoke<string | null>("foundry_read_thumbnail", { identity }));
    signal.throwIfAborted();
    if (existing) return remember(identity, existing);
    const filePath = await resolveModVpk(
      mod.remoteId,
      mod.installedVpks,
      profileFolder,
    );
    signal.throwIfAborted();
    const info = await invoke<ModPreviewInfo>("foundry_mod_preview_info", {
      filePath,
    });
    signal.throwIfAborted();
    // Reuse covers produced before the import-based cache key was introduced.
    const previous = await invoke<string | null>("foundry_read_thumbnail", {
      identity: info.identity,
    });
    signal.throwIfAborted();
    if (previous) {
      await invoke("foundry_save_thumbnail", {
        identity,
        png: previous.slice(previous.indexOf(",") + 1),
      });
      return remember(identity, previous);
    }
    if (!info.modelPath || info.ambiguousHero) return null;
    const model = await decodeFoundryModel(
      info.filePath,
      info.modelPath,
      null,
      signal,
    );
    try {
      // Partial previews need viewer diagnostics, rather than an accurate-looking cover.
      if (model.report?.issues.length) return null;
      const image = await renderModelThumbnail(model, signal);
      if (!image) return null;
      const bytes = new Uint8Array(await image.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const png = btoa(binary);
      signal.throwIfAborted();
      await invoke("foundry_save_thumbnail", { identity, png });
      return remember(identity, `data:image/png;base64,${png}`);
    } finally {
      releaseFoundryModel(model);
    }
  }, signal);
};

export const localModThumbnailOptions = (
  mod: ThumbnailMod,
  profileFolder: string | null,
) =>
  queryOptions({
    queryKey: ["local-mod-thumbnail", mod.remoteId],
    queryFn: ({ signal }) => localModThumbnail(mod, profileFolder, signal),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
