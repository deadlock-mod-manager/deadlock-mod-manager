import type { LoadedPlugin, PluginManifest } from "@/types/plugins";

const manifestModules = import.meta.glob("@/plugins/*/manifest.json", {
  eager: true,
  import: "default",
}) as Record<string, PluginManifest>;

const iconModules = import.meta.glob("@/plugins/*/**", {
  eager: true,
}) as Record<string, { default?: string } | string>;

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

export function getPlugins(): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = [];

  for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
    if (!manifest || typeof manifest !== "object") {
      continue;
    }

    const basePath = manifestPath.replace(/\/manifest\.json$/, "");

    let iconUrl: string | undefined;
    if (manifest.icon) {
      const iconPath = normalizePath(`${basePath}/${manifest.icon}`);
      const mod = iconModules[iconPath] as
        | { default?: string }
        | string
        | undefined;
      if (typeof mod === "string") iconUrl = mod;
      else if (mod && typeof mod.default === "string") iconUrl = mod.default;
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
