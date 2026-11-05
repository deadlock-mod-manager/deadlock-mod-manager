import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";

export function useWorkbenchArchives(onOpen: (vpk: ModdingLibraryVpk) => void) {
  const [external, setExternal] = useState<ModdingLibraryVpk[]>([]);
  const browse = useMutation({
    mutationFn: async () => {
      const filePath = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "VPK", extensions: ["vpk"] }],
      });
      if (!filePath) return null;
      await invoke<ModdingArchiveEntry[]>("list_modding_archive_files", {
        archivePath: filePath,
        directory: "",
        search: "",
      });
      return { filePath, label: filePath.split(/[/\\]/).pop() ?? filePath };
    },
    onSuccess: (vpk) => {
      if (!vpk) return;
      setExternal((previous) => [
        ...previous.filter((item) => item.filePath !== vpk.filePath),
        vpk,
      ]);
      onOpen(vpk);
    },
  });

  return { external, browse };
}
