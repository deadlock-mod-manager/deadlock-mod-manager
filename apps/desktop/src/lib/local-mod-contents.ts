import { invoke } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { ModCategory } from "@/lib/constants";
import { getSourceFilePath } from "@/lib/file-utils";
import type { LocalPartContents } from "@/types/generated/LocalPartContents";

export const localModContentsOptions = (filePaths: string[]) =>
  queryOptions({
    queryKey: ["local-mod-contents", filePaths],
    queryFn: () =>
      invoke<LocalPartContents[]>("inspect_local_mod_files", { filePaths }),
    enabled: filePaths.length > 0,
    staleTime: Infinity,
    // Drops are staged under their own name, so the same path can hold a
    // different file next time.
    gcTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });

export const partContentsFor = (
  contents: LocalPartContents[] | undefined,
  file: File,
) => contents?.find((part) => part.filePath === getSourceFilePath(file));

export const detectedMapName = (parts: LocalPartContents[]): string | null =>
  parts.flatMap((part) => part.mapNames)[0] ?? null;

const sum = (
  parts: LocalPartContents[],
  count: (part: LocalPartContents) => number,
) => parts.reduce((total, part) => total + count(part), 0);

/**
 * The category the files point to, or null when they could be several. Maps
 * and skins win over the sounds a skin often ships with. Models that name no
 * hero (items, particles, weapons) fit too many categories to guess.
 */
export const suggestCategory = (
  parts: LocalPartContents[],
): ModCategory | null => {
  if (parts.some((part) => part.mapNames.length > 0)) return ModCategory.MAPS;
  if (parts.some((part) => part.reskinsHero)) return ModCategory.SKINS;
  if (sum(parts, (part) => part.models + part.particles) > 0) return null;

  const sounds: [ModCategory, number][] = [
    [ModCategory.VOICE_LINES, sum(parts, (part) => part.voiceLines)],
    [ModCategory.ABILITY_SOUNDS, sum(parts, (part) => part.abilitySounds)],
    [ModCategory.WEAPON_SOUNDS, sum(parts, (part) => part.weaponSounds)],
  ];
  const otherSounds = sum(parts, (part) => part.otherSounds);
  const [category, count] = sounds.reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );
  if (count === 0 && otherSounds === 0) {
    return sum(parts, (part) => part.hudFiles) > 0 ? ModCategory.HUD : null;
  }
  return count > otherSounds ? category : null;
};
