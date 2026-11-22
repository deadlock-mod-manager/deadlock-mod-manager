import type { ModDto } from "@deadlock-mods/shared";

export const getModCoverImage = (
  mod: Pick<ModDto, "images" | "thumbnailUrl">,
): string | undefined => mod.thumbnailUrl || mod.images?.[0];
