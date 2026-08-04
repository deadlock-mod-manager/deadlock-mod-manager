import { useMemo } from "react";
import { shouldBlurNSFWItem } from "@/lib/mods/nsfw-visibility";
import { usePersistedStore } from "@/lib/store";

interface NSFWItem {
  remoteId: string;
  isNSFW: boolean;
}

/**
 * Custom hook to handle NSFW blur logic for mods
 * @param item - The item with remoteId and isNSFW properties
 * @returns shouldBlur boolean and handleNSFWToggle function
 */
export function useNSFWBlur(item?: NSFWItem | null) {
  const nsfwSettings = usePersistedStore((state) => state.nsfwSettings);
  const setPerItemNSFWOverride = usePersistedStore(
    (state) => state.setPerItemNSFWOverride,
  );
  const getPerItemNSFWOverride = usePersistedStore(
    (state) => state.getPerItemNSFWOverride,
  );

  const shouldBlur = useMemo(() => {
    if (!item) return false;

    return shouldBlurNSFWItem({
      isNSFW: item.isNSFW,
      isVisibleOverride: getPerItemNSFWOverride(item.remoteId),
    });
  }, [item, getPerItemNSFWOverride]);

  const handleNSFWToggle = (visible: boolean) => {
    if (item && nsfwSettings.rememberPerItemOverrides) {
      setPerItemNSFWOverride(item.remoteId, visible);
    }
  };

  return {
    shouldBlur,
    handleNSFWToggle,
    nsfwSettings,
  };
}
