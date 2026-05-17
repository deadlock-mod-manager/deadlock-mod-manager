import { CONFIG_PATTERN } from "@/lib/file-patterns";
import type { LocalMod, ModFileTree } from "@/types/mods";

export interface ConfigHistoryEntry {
  currentConfigFiles?: readonly string[];
  disabledConfigFiles?: readonly string[];
  originalConfigFilePaths?: readonly string[];
}

export interface ConfigDirectoryEntry {
  name: string;
  isDirectory?: boolean;
  children?: readonly ConfigDirectoryEntry[];
}

export const hasConfigHistory = (entry: ConfigHistoryEntry): boolean =>
  (entry.currentConfigFiles?.length ?? 0) > 0 ||
  (entry.disabledConfigFiles?.length ?? 0) > 0 ||
  (entry.originalConfigFilePaths?.length ?? 0) > 0;

export const shouldTreatInstallAsConfig = (
  mod: Pick<LocalMod, "isConfig">,
  fileTree?: Pick<ModFileTree, "files">,
  configFiles?: readonly string[],
): boolean =>
  (fileTree?.files.some((file) => file.kind === "config") ?? false) ||
  (configFiles?.length ?? 0) > 0 ||
  (mod.isConfig ?? false);

export const stripStoredModPrefix = (
  filename: string,
  remoteId: string,
): string => {
  const prefix = `${remoteId}_`;
  return filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
};

export const entriesContainFileMatching = (
  entries: readonly ConfigDirectoryEntry[],
  pattern: RegExp,
): boolean =>
  entries.some(
    (entry) =>
      pattern.test(entry.name) ||
      entriesContainFileMatching(entry.children ?? [], pattern),
  );

export const entriesContainConfigFile = (
  entries: readonly ConfigDirectoryEntry[],
): boolean => entriesContainFileMatching(entries, CONFIG_PATTERN);
