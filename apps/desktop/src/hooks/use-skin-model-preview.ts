import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  analyzeDefaultFoundryHero,
  analyzeFoundryVpk,
  decodeFoundryModel,
  getPrimaryModelPath,
  releaseFoundryArchives,
  resolveModVpk,
} from "@/lib/foundry";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

/** `unsupported` is not a failure: the VPK simply holds no hero model. */
export type SkinModel =
  | { kind: "model"; dataUrl: string }
  | { kind: "unsupported" };

/** How long a decoded model survives with nothing on screen showing it. */
const MODEL_CACHE_TIME_MS = 5 * 60 * 1000;

/**
 * The Foundry's model pipeline without the editor around it: no workspace is
 * prepared, so nothing is unpacked to disk and nothing is written.
 */
const decodeSkinModel = async (
  mod: LocalMod | null,
  hero: string,
  profileFolder: string | null,
): Promise<SkinModel> => {
  const manifest = mod
    ? await analyzeFoundryVpk(
        await resolveModVpk(mod.remoteId ?? mod.id, profileFolder),
      )
    : await analyzeDefaultFoundryHero(hero);

  const modelPath = manifest.isHeroSkin ? getPrimaryModelPath(manifest) : null;
  if (!modelPath) {
    return { kind: "unsupported" };
  }
  const model = await decodeFoundryModel(manifest.filePath, modelPath, null);
  return { kind: "model", dataUrl: model.dataUrl };
};

/**
 * The 3D preview for one hero skin, or for the hero's default look when `mod`
 * is null, as everywhere else on the page. Disabled, nothing is decoded at all
 * — the decode is the expensive part, and that is the point of the setting.
 */
export const useSkinModelPreview = (
  hero: string,
  mod: LocalMod | null,
  enabled: boolean,
) => {
  const profileFolder = usePersistedStore(
    (state) => state.profiles[state.activeProfileId]?.folderName ?? null,
  );

  // Parsed VPK indexes stay cached in the backend so switching skins is quick;
  // a parsed pak01 is a large thing to hold onto once the page is gone.
  useEffect(() => () => void releaseFoundryArchives(), []);

  return useQuery({
    // Everything resolveModVpk reads is in the key: they all decide which
    // archive is opened, and so which model comes back.
    queryKey: [
      "skin-model-preview",
      hero,
      mod?.remoteId ?? mod?.id ?? null,
      mod?.installedVpks ?? [],
      mod?.activeVariantArchive ?? null,
      profileFolder,
    ],
    queryFn: () => decodeSkinModel(mod, hero, profileFolder),
    enabled,
    // A skin's model only changes when the skin does, and that changes the key.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: MODEL_CACHE_TIME_MS,
    retry: false,
    // The panel shows the failure in place, with a retry; a toast on top of
    // that would say the same thing twice.
    meta: { skipGlobalErrorHandler: true },
  });
};
