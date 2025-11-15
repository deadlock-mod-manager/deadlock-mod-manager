/// <reference types="vite/client" />

import type { LoadedPlugin, PluginManifest } from "@/types/plugins";

const manifestModules = import.meta.glob("@/plugins/*/manifest.json", {
  eager: true,
  import: "default",
}) as Record<string, PluginManifest>;

const pluginAssetModules = import.meta.glob(
  [
    "@/plugins/*/**/*.{png,jpg,jpeg,gif,svg,webp,avif,ico,bmp}",
    "@/plugins/*/**/*.{mp3,mp4,ogg,wav,webm}",
    "@/plugins/*/**/*.{woff,woff2,ttf,otf}",
  ],
  {
    eager: true,
    as: "url",
  },
) as Record<string, string>;

const entryModules = import.meta.glob(
  [
    "@/plugins/*/src/**/*.tsx",
    "@/plugins/*/src/**/*.ts",
    "@/plugins/*/index.tsx",
    "@/plugins/*/index.ts",
  ],
  {
    eager: false,
  },
);

type PluginIndexEntry = {
  basePath: string;
  manifest: PluginManifest;
};

const pluginIndex = new Map<string, PluginIndexEntry>();

for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
  if (!manifest || typeof manifest !== "object") {
    continue;
  }

  const pluginId = manifest.id;

  if (!pluginId) {
    throw new Error(
      `Plugin manifest at "${manifestPath}" is missing the required "id" field.`,
    );
  }

  if (pluginIndex.has(pluginId)) {
    continue;
  }

  const basePath = manifestPath.replace(/\/manifest\.json$/, "");
  pluginIndex.set(pluginId, { basePath, manifest });
}

function normalizePath(inputPath: string): string {
  const collapsed = inputPath.replace(/\/+/g, "/");
  const parts = collapsed.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" && out.length > 0) continue; // skip duplicate slashes (keep possible leading alias like @)
    if (part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "@") out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

function resolveEntryPath(basePath: string, entryPath: string): string {
  if (entryPath.startsWith("./")) {
    return normalizePath(`${basePath}/${entryPath.slice(2)}`);
  }
  if (entryPath.startsWith("/")) {
    return entryPath;
  }
  return normalizePath(`${basePath}/${entryPath}`);
}

function resolvePluginRelativePath(
  basePath: string,
  targetPath: string,
): string {
  if (targetPath.startsWith("@/")) {
    return normalizePath(targetPath);
  }
  return resolveEntryPath(basePath, targetPath);
}

function getPluginIndexEntry(pluginId: string): PluginIndexEntry {
  const entry = pluginIndex.get(pluginId);
  if (!entry) {
    throw new Error(
      `Unknown plugin "${pluginId}" while resolving plugin resources.`,
    );
  }
  return entry;
}

export function getPluginAssetUrl(
  pluginId: string,
  relativePath: string,
): string {
  if (!relativePath) {
    throw new Error(
      `Asset path must be provided when resolving assets for plugin "${pluginId}".`,
    );
  }

  const { basePath } = getPluginIndexEntry(pluginId);
  const assetPath = resolvePluginRelativePath(basePath, relativePath);
  const url = pluginAssetModules[assetPath];
  if (typeof url === "string") {
    return url;
  }

  throw new Error(
    `Static asset "${relativePath}" for plugin "${pluginId}" could not be resolved.`,
  );
}

export function getPlugins(): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = [];

  for (const { manifest, basePath } of pluginIndex.values()) {
    let iconUrl: string | undefined;
    if (manifest.icon) {
      iconUrl = getPluginAssetUrl(manifest.id, manifest.icon);
    }

    let entryImporter: (() => Promise<unknown>) | undefined;
    if (manifest.entry) {
      const entryPath = resolveEntryPath(basePath, manifest.entry);
      const importer = entryModules[entryPath];
      if (importer) {
        entryImporter = importer as () => Promise<unknown>;
      }
    }

    const plugin = { manifest, iconUrl, basePath, entryImporter };
    plugins.push(plugin);
  }

  plugins.sort((a, b) => {
    const aOfficial = a.manifest.tags?.includes("official") ? 0 : 1;
    const bOfficial = b.manifest.tags?.includes("official") ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    return a.manifest.id.localeCompare(b.manifest.id);
  });

  return plugins;
}
