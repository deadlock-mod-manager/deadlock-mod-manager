import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  ensureDirectory,
  getFileBaseName,
  getFileName,
  writeFileInChunks,
} from "@/lib/file-utils";
import type { WorkspaceSource } from "@/lib/modding-workspace";
import type { WorkspaceDrop } from "@/lib/modding-workspace-drop";

export function useWorkspaceDrop(onOpen: (sources: WorkspaceSource[]) => void) {
  const { t } = useTranslation();
  return useMutation({
    mutationKey: ["workbench-source-open"],
    mutationFn: async (payload: Promise<WorkspaceDrop>) => {
      const { internal, files, paths, directory } = await payload;
      if (internal) {
        if (internal.kind === "addon")
          await invoke("prepare_modding_addon_files", {
            addonId: internal.addonId,
          });
        return [internal];
      }
      if (!paths.length && directory) {
        const folder = await open({
          directory: true,
          multiple: false,
          title: t("workbenchCompare.chooseDroppedFolder"),
        });
        if (!folder) return [];
        paths.push(folder);
      } else if (!paths.length && files.length) {
        if (files.length > 256)
          throw new Error(t("workbenchExplorer.dropLimit"));
        const staging = await join(
          await appLocalDataDir(),
          "workbench-sources",
          crypto.randomUUID(),
        );
        await ensureDirectory(staging);
        const names = new Set<string>();
        for (const file of files) {
          const name = getFileBaseName(file);
          if (
            !getFileName(file) ||
            name === "." ||
            name === ".." ||
            names.has(name.toLowerCase())
          )
            throw new Error(t("workbenchExplorer.invalidDrop"));
          names.add(name.toLowerCase());
          const path = await join(staging, name);
          await writeFileInChunks(path, file);
          paths.push(path);
        }
      }
      if (!paths.length) throw new Error(t("workbenchExplorer.invalidDrop"));
      const sources: WorkspaceSource[] = [];
      for (const path of paths) {
        const opened = await invoke<WorkspaceSource[]>(
          "open_modding_workspace_source",
          { path },
        );
        for (const source of opened) {
          if (source.kind === "addon")
            await invoke("prepare_modding_addon_files", {
              addonId: source.addonId,
            });
          if (
            !sources.some(
              (entry) => JSON.stringify(entry) === JSON.stringify(source),
            )
          )
            sources.push(source);
        }
      }
      return sources;
    },
    onSuccess: onOpen,
  });
}
