import { useQuery } from "@tanstack/react-query";
import { localModThumbnailOptions } from "@/lib/mod-thumbnails";
import { needsLocalThumbnail } from "@/lib/mods/local-preview-image";
import type { LocalMod } from "@/types/mods";
import { useActiveProfileFolder } from "./use-mod-health";

export const useLocalModThumbnail = (mod: LocalMod | null | undefined) => {
  const profileFolder = useActiveProfileFolder();
  return useQuery({
    ...localModThumbnailOptions(mod ?? { remoteId: "" }, profileFolder),
    enabled: !!mod && needsLocalThumbnail(mod),
  });
};
