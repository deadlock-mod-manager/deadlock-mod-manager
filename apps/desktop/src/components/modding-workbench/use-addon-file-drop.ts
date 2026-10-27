import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { ensureDirectory, writeFileInChunks } from "@/lib/file-utils";
import { addonMoveDestination } from "@/lib/modding-file-drag";
import type { AddonTreeProps } from "./addon-file-branch";

export function useAddonFileDrop(props: AddonTreeProps) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const changed = async () => {
    await client.invalidateQueries({
      queryKey: ["workbench-files", props.addon.id],
    });
    props.onChanged();
  };
  const copy = useMutation({
    mutationKey: ["workbench-files-change", props.addon.id],
    mutationFn: async (files: File[]) => {
      if (!files.length || files.length > 256)
        throw new Error(t("workbenchExplorer.dropLimit"));
      const staging = await join(
        await appLocalDataDir(),
        "workbench-drops",
        crypto.randomUUID(),
      );
      await ensureDirectory(staging);
      try {
        const sources: string[] = [];
        for (const file of files) {
          if (
            !file.name ||
            /[/\\]/.test(file.name) ||
            file.name === "." ||
            file.name === ".."
          )
            throw new Error(t("workbenchExplorer.invalidDrop"));
          if (
            sources.some(
              (source) =>
                source.endsWith(`/${file.name}`) ||
                source.endsWith(`\\${file.name}`),
            )
          )
            throw new Error(
              t("workbenchExplorer.duplicateDrop", { name: file.name }),
            );
          const path = await join(staging, file.name);
          await writeFileInChunks(path, file);
          sources.push(path);
        }
        return await invoke<number>("import_modding_local_files", {
          addonId: props.addon.id,
          hierarchy: props.hierarchy,
          sources,
        });
      } finally {
        await remove(staging, {
          recursive: true,
          baseDir: BaseDirectory.AppLocalData,
        });
      }
    },
    onSuccess: async (count) => {
      await changed();
      toast.success(t("workbenchExplorer.droppedFiles", { count }));
    },
  });
  const move = useMutation({
    mutationKey: ["workbench-files-change", props.addon.id],
    mutationFn: async ({
      source,
      folder,
    }: {
      source: string;
      folder: string;
    }) => {
      const destination = addonMoveDestination(source, folder);
      if (!destination) return null;
      await invoke("change_modding_file", {
        addonId: props.addon.id,
        hierarchy: props.hierarchy,
        action: "rename",
        path: source,
        destination,
      });
      return destination;
    },
    onSuccess: async (destination, { source }) => {
      if (!destination) return;
      if (props.selected === source || props.selected.startsWith(`${source}/`))
        props.onSelect(destination + props.selected.slice(source.length));
      await changed();
    },
  });
  return { copy, move, busy: copy.isPending || move.isPending };
}
