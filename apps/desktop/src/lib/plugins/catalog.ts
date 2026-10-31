import type { ExternalPluginPermission } from "@/types/generated/ExternalPluginPermission";

export type CatalogCategory = "creator" | "match" | "library" | "audio" | "hud";

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "creator",
  "match",
  "library",
  "audio",
  "hud",
];

export type CatalogEntry = {
  /** The id the plugin installs under, used to tell whether it is installed. */
  id: string;
  /** Key under `plugins.catalog` for its copy. */
  copyKey: string;
  name: string;
  author: string;
  verified: boolean;
  icon: string;
  accent: string;
  category: CatalogCategory;
  /** What its manifest asks for, so Discover can say so before installing. */
  permissions: ExternalPluginPermission[];
  /** Unknown until the catalog service reports install counts. */
  installs?: number;
  updatedAt: string;
  /** Where to download the release; entries without one aren't published yet. */
  archive?: { url: string; sha256: string };
};

/** The bundled catalog shown on Discover. */
export const PLUGIN_CATALOG: CatalogEntry[] = [
  {
    id: "example.creator-workspace-bridge",
    copyKey: "creatorWorkspaceBridge",
    name: "Creator Workspace Bridge",
    author: "DMM examples",
    verified: true,
    icon: "wrench",
    accent: "#E3B35A",
    category: "creator",
    permissions: [
      { id: "files", kind: "file", extensions: ["vpk"], access: "read" },
      { id: "mods", access: ["install"], profiles: "picked" },
      { id: "storage" },
    ],
    updatedAt: "2026-10-31",
  },
];
