import { useEffect, useState } from "react";
import { foundrySkinPalette } from "@/lib/foundry";
import logger from "@/lib/logger";
import type { FoundryPaintPart } from "@/types/foundry";

/**
 * The colors the skin's paintable sections already wear, read from their
 * original color maps, so the brush can offer them.
 */
export const useSkinPalette = (
  filePath: string | null,
  parts: readonly FoundryPaintPart[],
): string[] | null => {
  const [palette, setPalette] = useState<string[] | null>(null);

  useEffect(() => {
    setPalette(null);
    if (!filePath || parts.length === 0) return;
    let cancelled = false;
    const textures = [...new Set(parts.map((part) => part.texture))];
    foundrySkinPalette(filePath, textures)
      .then((colors) => {
        if (!cancelled) setPalette(colors);
      })
      .catch((err) => {
        logger.withError(err).warn("[Foundry] Skin palette failed");
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, parts]);

  return palette;
};
