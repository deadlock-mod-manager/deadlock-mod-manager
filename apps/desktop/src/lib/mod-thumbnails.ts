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

const localCoverIdentity = async (remoteId: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`dmm-local-cover-1:${remoteId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const keepCover = async (identity: string, dataUrl: string) => {
  await invoke("foundry_save_thumbnail", {
    identity,
    png: dataUrl.slice(dataUrl.indexOf(",") + 1),
  });
  return remember(identity, dataUrl);
};

export const saveLocalCover = async (remoteId: string, dataUrl: string) =>
  keepCover(await localCoverIdentity(remoteId), dataUrl);

const localModThumbnail = async (
  mod: ThumbnailMod,
  profileFolder: string | null,
  signal: AbortSignal,
): Promise<string | null> => {
  const identity = await localCoverIdentity(mod.remoteId);
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
    const previous = await invoke<string | null>("foundry_read_thumbnail", {
      identity: info.identity,
    });
    signal.throwIfAborted();
    if (previous) return keepCover(identity, previous);
    const png = await renderCover(info, signal);
    if (!png) return null;
    signal.throwIfAborted();
    await invoke("foundry_save_thumbnail", { identity, png });
    return remember(identity, `data:image/png;base64,${png}`);
  }, signal);
};

const renderCover = async (
  info: ModPreviewInfo,
  signal: AbortSignal,
): Promise<string | null> => {
  if (!info.modelPath || info.ambiguousHero) return null;
  const model = await decodeFoundryModel(
    info.filePath,
    info.modelPath,
    null,
    signal,
  );
  try {
    if (model.report?.issues.length) return null;
    const image = await renderModelThumbnail(model, signal);
    if (!image) return null;
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  } finally {
    releaseFoundryModel(model);
  }
};

const filesCover = (filePaths: string[], signal: AbortSignal) =>
  previewCaptureQueue.run(
    async () => {
      for (const filePath of filePaths) {
        const info = await invoke<ModPreviewInfo>("foundry_mod_preview_info", {
          filePath,
        });
        signal.throwIfAborted();
        const png = await renderCover(info, signal);
        if (png) return `data:image/png;base64,${png}`;
      }
      return null;
    },
    signal,
    1,
  );

export const filesCoverOptions = (filePaths: string[]) =>
  queryOptions({
    queryKey: ["files-cover", filePaths],
    queryFn: ({ signal }) => filesCover(filePaths, signal),
    enabled: filePaths.length > 0,
    networkMode: "always",
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });

export const localModThumbnailOptions = (
  mod: ThumbnailMod,
  profileFolder: string | null,
) =>
  queryOptions({
    queryKey: ["local-mod-thumbnail", mod.remoteId],
    queryFn: ({ signal }) => localModThumbnail(mod, profileFolder, signal),
    networkMode: "always",
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
