import { useMemo } from 'react';
import { usePersistedStore } from '@/lib/store';

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
  const { nsfwSettings, setPerItemNSFWOverride, getPerItemNSFWOverride } =
    usePersistedStore();

  const shouldBlur = useMemo(() => {
    if (!item?.isNSFW) {
      return false; // Not NSFW, no need to blur
    }

    // Check for per-item override first
    const override = getPerItemNSFWOverride(item.remoteId);
    if (override !== undefined) {
      return !override; // If override says show (true), don't blur (false)
    }

    // Use global setting if no per-item override
    return !nsfwSettings.hideNSFW; // If hiding NSFW globally, blur when visible
  }, [item, nsfwSettings.hideNSFW, getPerItemNSFWOverride]);

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
