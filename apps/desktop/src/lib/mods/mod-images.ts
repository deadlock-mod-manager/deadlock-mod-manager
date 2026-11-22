import type { ModDto } from "@deadlock-mods/shared";

/**
 * Image for cards and list rows: the catalog's 530px cover rendition when it
 * is known, otherwise the full-size screenshot. Full-width banners and the
 * detail gallery should keep using `images` directly.
 */
export const getModCoverImage = (
  mod: Pick<ModDto, "images" | "thumbnailUrl">,
): string | undefined => mod.thumbnailUrl || mod.images?.[0];
