export type PluginTag = "official" | "third-party" | string;

export type PluginManifest = {
  id: string;
  nameKey: string;
  descriptionKey: string;
  version: string;
  author: string | string[];
  authorUrl?: string | string[];
  homepageUrl?: string;
  icon: string;
  tags?: PluginTag[];
  entry?: string;
  disabledPlugins?: string[];
  alwaysEnabled?: boolean;
};

export type LoadedPlugin = {
  manifest: PluginManifest;
  iconUrl?: string;
  basePath: string;
  entryImporter?: () => Promise<unknown>;
};
