import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useModPreviewInfo } from "./use-mod-preview-info";
import type { ModPreviewInfo } from "@/types/generated/ModPreviewInfo";
import { useActiveProfileFolder } from "@/hooks/use-mod-health";
import {
  analyzeDefaultFoundryHero,
  decodeFoundryModel,
  getPrimaryModelPath,
  releaseFoundryArchives,
} from "@/lib/foundry";
import { cacheFoundryModel, releaseFoundryModel } from "@/lib/model-assets";
import type { FoundryModel } from "@/types/foundry";
import type { LocalMod } from "@/types/mods";

export type SkinModel =
  | {
      kind: "model";
      model: FoundryModel;
      filePath: string;
      entryPath: string;
      stockFilePath: string | null;
      revision: string;
    }
  | { kind: "unsupported" }
  | { kind: "missingAssets" };

const MODEL_CACHE_TIME_MS = 0;

const decodeSkinModel = async (
  mod: LocalMod | null,
  hero: string,
  info: ModPreviewInfo | null,
  signal: AbortSignal,
): Promise<SkinModel> => {
  const manifest = mod ? null : await analyzeDefaultFoundryHero(hero);
  const modelPath = mod
    ? info?.modelPath
    : manifest
      ? getPrimaryModelPath(manifest)
      : null;
  const filePath = info?.filePath ?? manifest?.filePath;
  if (info?.hero && !info.modelPath && !info.gameAssetsAvailable)
    return { kind: "missingAssets" };
  if (!modelPath || !filePath) {
    return { kind: "unsupported" };
  }
  const model = await decodeFoundryModel(filePath, modelPath, null, signal);
  return {
    kind: "model",
    model,
    filePath,
    stockFilePath: info?.stockFilePath ?? null,
    revision: info?.identity ?? filePath,
    entryPath: modelPath,
  };
};

export const useSkinModelPreview = (
  hero: string,
  mod: LocalMod | null,
  enabled = true,
) => {
  const profileFolder = useActiveProfileFolder();
  const client = useQueryClient();
  const info = useModPreviewInfo(mod, enabled);

  useEffect(() => () => void releaseFoundryArchives(), []);

  const queryKey = [
    "skin-model-preview",
    hero,
    mod?.remoteId ?? mod?.id ?? null,
    mod?.installedVpks ?? [],
    mod?.activeVariantArchive ?? null,
    mod?.downloadedAt ?? null,
    mod?.status ?? null,
    profileFolder,
    info.data?.identity,
  ];
  const preview = useQuery({
    enabled: enabled && (!mod || !!info.data),
    queryKey,
    queryFn: async ({ signal }) => {
      const preview = await decodeSkinModel(
        mod,
        hero,
        info.data ?? null,
        signal,
      );
      if (preview.kind === "model") {
        if (signal.aborted) {
          releaseFoundryModel(preview.model);
          signal.throwIfAborted();
        }
        cacheFoundryModel(client, queryKey, preview.model);
      }
      return preview;
    },
    staleTime: 60_000,
    gcTime: MODEL_CACHE_TIME_MS,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  return info.isError
    ? {
        ...preview,
        isError: true,
        isPending: false,
        error: info.error,
        refetch: info.refetch,
      }
    : preview;
};
