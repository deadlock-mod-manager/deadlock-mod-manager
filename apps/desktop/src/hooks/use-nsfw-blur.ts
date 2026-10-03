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
  const isVisibleOverride = usePersistedStore((state) =>
    item ? state.perItemNSFWOverrides[item.remoteId] : undefined,
  );

  const shouldBlur = item
    ? shouldBlurNSFWItem({
        isNSFW: item.isNSFW,
        isVisibleOverride,
        rememberOverrides: nsfwSettings.rememberPerItemOverrides,
      })
    : false;

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
