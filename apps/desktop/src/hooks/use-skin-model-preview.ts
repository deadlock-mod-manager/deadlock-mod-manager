import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useActiveProfileFolder } from "@/hooks/use-mod-health";
import {
  analyzeDefaultFoundryHero,
  analyzeFoundryVpk,
  decodeFoundryModel,
  getPrimaryModelPath,
  releaseFoundryArchives,
  resolveModVpk,
} from "@/lib/foundry";
import { cacheFoundryModel, releaseFoundryModel } from "@/lib/model-assets";
import type { FoundryModel } from "@/types/foundry";
import type { LocalMod } from "@/types/mods";

/** `unsupported` is not a failure: the VPK simply holds no hero model. */
export type SkinModel =
  | { kind: "model"; model: FoundryModel; filePath: string; entryPath: string }
  | { kind: "unsupported" };

/** How long a decoded model survives with nothing on screen showing it. */
const MODEL_CACHE_TIME_MS = 0;

/**
 * The Foundry's model pipeline without the editor around it: no workspace is
 * prepared. Analysis stages a local VPK copy; source mods stay unchanged.
 */
const decodeSkinModel = async (
  mod: LocalMod | null,
  hero: string,
  profileFolder: string | null,
  signal: AbortSignal,
): Promise<SkinModel> => {
  const manifest = mod
    ? await analyzeFoundryVpk(
        await resolveModVpk(
          mod.remoteId ?? mod.id,
          mod.installedVpks ?? [],
          profileFolder,
        ),
      )
    : await analyzeDefaultFoundryHero(hero);

  const modelPath = manifest.isHeroSkin ? getPrimaryModelPath(manifest) : null;
  if (!modelPath) {
    return { kind: "unsupported" };
  }
  const model = await decodeFoundryModel(
    manifest.filePath,
    modelPath,
    null,
    signal,
  );
  return {
    kind: "model",
    model,
    filePath: manifest.filePath,
    entryPath: modelPath,
  };
};

/**
 * The 3D preview for one hero skin, or for the hero's default look when `mod`
 * is null, as everywhere else on the page. Only mounted while the preview
 * setting is on — the decode is the expensive part, and that is the point of
 * the setting.
 */
export const useSkinModelPreview = (
  hero: string,
  mod: LocalMod | null,
  enabled = true,
) => {
  const profileFolder = useActiveProfileFolder();
  const client = useQueryClient();

  // Parsed VPK indexes stay cached in the backend so switching skins is quick;
  // a parsed pak01 is a large thing to hold onto once the page is gone.
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
  ];
  return useQuery({
    enabled,
    queryKey,
    queryFn: async ({ signal }) => {
      const preview = await decodeSkinModel(mod, hero, profileFolder, signal);
      if (preview.kind === "model") {
        if (signal.aborted) {
          releaseFoundryModel(preview.model);
          signal.throwIfAborted();
        }
        cacheFoundryModel(client, queryKey, preview.model);
      }
      return preview;
    },
    // Keep decoded models only while a preview is mounted.
    staleTime: 60_000,
    gcTime: MODEL_CACHE_TIME_MS,
    retry: false,
    // The panel shows the failure in place, with a retry; a toast on top of
    // that would say the same thing twice.
    meta: { skipGlobalErrorHandler: true },
  });
};
