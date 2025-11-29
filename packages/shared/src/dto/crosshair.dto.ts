import type { Crosshair } from "@deadlock-mods/database";
import type { CrosshairConfig } from "../types/crosshair";

export interface PublishedCrosshairDto {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  name: string;
  description: string | null;
  config: CrosshairConfig;
  tags: string[];
  heroes: string[];
  likes: number;
  downloads: number;
  hasLiked?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCrosshairDto {
  name: string;
  description?: string;
  config: CrosshairConfig;
  tags: string[];
  heroes: string[];
}

export const toCrosshairDto = (
  crosshair: Crosshair & {
    user?: { name: string | null; image: string | null } | null;
    hasLiked?: boolean;
  },
): PublishedCrosshairDto => {
  return {
    id: crosshair.id,
    userId: crosshair.userId,
    userName: crosshair.user?.name ?? null,
    userImage: crosshair.user?.image ?? null,
    name: crosshair.name,
    description: crosshair.description ?? null,
    config: crosshair.config as CrosshairConfig,
    tags: crosshair.tags,
    heroes: crosshair.heroes,
    likes: crosshair.likes,
    downloads: crosshair.downloads,
    hasLiked: crosshair.hasLiked,
    createdAt: crosshair.createdAt ?? new Date(),
    updatedAt: crosshair.updatedAt ?? new Date(),
  };
};
