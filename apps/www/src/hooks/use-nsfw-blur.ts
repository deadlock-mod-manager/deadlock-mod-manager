import { DEFAULT_NSFW_SETTINGS } from "@deadlock-mods/shared";
import { useMemo } from "react";

interface NSFWItem {
  remoteId: string;
  isNSFW: boolean;
}

/**
 * Simplified NSFW blur hook for www app
 * Returns whether content should be blurred based on NSFW flag
 */
export function useNSFWBlur(item?: NSFWItem | null) {
  const nsfwSettings = DEFAULT_NSFW_SETTINGS;

  const shouldBlur = useMemo(() => {
    if (!item?.isNSFW) {
      return false;
    }

    return !nsfwSettings.disableBlur;
  }, [item, nsfwSettings.disableBlur]);

  return {
    shouldBlur,
    nsfwSettings,
  };
}
