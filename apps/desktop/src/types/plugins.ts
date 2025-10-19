export type PluginTag = "official" | "third-party" | string;

export type PluginManifest = {
  id: string;
  nameKey: string; // i18n key for plugin title
  descriptionKey: string; // i18n key for plugin description
  version: string;
  author: string | string[];
  authorUrl?: string | string[];
  homepageUrl?: string;
  icon: string; // relative path within the plugin folder to an svg/png
  tags?: PluginTag[];
  entry?: string; // module entry relative path (e.g., ./src/index.tsx)
  disabledPlugins?: string[]; // plugin IDs to disable when this plugin is enabled
};

export type LoadedPlugin = {
  manifest: PluginManifest;
  // Resolved URL to the plugin icon asset served by Vite
  iconUrl?: string;
  basePath: string; // plugin folder base path
  entryImporter?: () => Promise<unknown>;
};
