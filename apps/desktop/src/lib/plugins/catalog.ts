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
  id: string;
  copyKey: string;
  name: string;
  author: string;
  verified: boolean;
  icon: string;
  accent: string;
  category: CatalogCategory;
  permissions: ExternalPluginPermission[];
  installs?: number;
  updatedAt: string;
  archive?: { url: string; sha256: string };
};

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
