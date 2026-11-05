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
  const {
    manifest,
    editedPaths,
    paintParts,
    appliedPaint,
    cardPreviews,
    removedParts,
  } = useFoundry();
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

    // A model's removed sections rewrite several files; they read as one
    // change, listed under its first file, and undo together.
    const removalOwners = new Map(
      Object.values(removedParts).flatMap((removed) =>
        removed.resources.map((path) => [path, removed] as const),
      ),
    );

    const paths = [...editedPaths].filter((path) => {
      const removal = removalOwners.get(path);
      return !removal || removal.resources[0] === path;
    });

    return paths.map((path): Change => {
      const removal = removalOwners.get(path);
      if (removal) {
        return {
          path,
          group: "paint",
          label: t("foundry.exportSheet.removedParts"),
          detail: removal.textures
            .map(
              (texture) => parts.get(texture.toLowerCase())?.label ?? texture,
            )
            .join(", "),
        };
      }
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
  }, [
    manifest,
    editedPaths,
    paintParts,
    appliedPaint,
    cardPreviews,
    removedParts,
    t,
  ]);
};
