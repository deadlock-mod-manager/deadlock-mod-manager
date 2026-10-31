import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { partPaintKey, useFoundry } from "./foundry-context";
export type ChangeGroup = "paint" | "cards" | "sounds" | "files";

export interface Change {
  path: string;
  group: ChangeGroup;
  label: string;
  detail: string;
  swatch?: string;
  thumb?: string;
}

/** Every edit in the workspace, named the way its tab names it. */
export const useChanges = (): Change[] => {
  const { t } = useTranslation();
  const { manifest, editedPaths, paintParts, appliedPaint, cardPreviews } =
    useFoundry();
  return useMemo(() => {
    if (!manifest) return [];
    const parts = new Map(
      paintParts.map((part) => [part.texture.toLowerCase(), part]),
    );
    const cards = new Map(
      [...cardPreviews.defaultCards, ...cardPreviews.modCards].map((card) => [
        card.path,
        card,
      ]),
    );
    const sounds = new Set(manifest.sounds.map((entry) => entry.path));
    const filename = (path: string) =>
      path
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? path;

    return [...editedPaths].map((path): Change => {
      const part = parts.get(path.toLowerCase());
      const card = cards.get(path);
      if (part) {
        const paint = appliedPaint[partPaintKey(part.texture)];
        return {
          path,
          group: "paint",
          label: part.label,
          detail: t("foundry.exportSheet.repainted"),
          swatch: paint?.colorHex,
        };
      }
      if (card) {
        return {
          path,
          group: "cards",
          label: t(`foundry.cards.variants.${card.variant}`, {
            defaultValue: card.variant.replaceAll("_", " "),
          }),
          detail: t("foundry.exportSheet.replaced"),
          thumb: card.dataUrl,
        };
      }
      if (sounds.has(path)) {
        return {
          path,
          group: "sounds",
          label: filename(path),
          detail: t("foundry.exportSheet.replaced"),
        };
      }
      return {
        path,
        group: path.endsWith(".vtex_c") ? "paint" : "files",
        label: filename(path),
        detail: t("foundry.exportSheet.edited"),
      };
    });
  }, [manifest, editedPaths, paintParts, appliedPaint, cardPreviews, t]);
};
