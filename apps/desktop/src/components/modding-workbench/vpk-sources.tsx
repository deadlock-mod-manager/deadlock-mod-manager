import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowClockwiseIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";
import { LibraryVpkRow } from "./library-vpk-row";

interface Props {
  disabled: boolean;
  activePath?: string;
  onOpen: (vpk: ModdingLibraryVpk) => void;
}

export const VpkSources = ({ disabled, activePath, onOpen }: Props) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  const [external, setExternal] = useState<ModdingLibraryVpk[]>([]);
  const open = useMutation({
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
  return (
    <details open className='border-t'>
      <summary className='cursor-pointer px-3 py-3 text-sm font-semibold'>
        {t("workbenchArchives.title")}
      </summary>
      <div className='flex gap-1 px-2 pb-2'>
        <Button
          size='sm'
          variant='outline'
          className='min-w-0 flex-1'
          disabled={disabled || open.isPending}
          onClick={() => open.mutate()}>
          <FolderOpenIcon />
          {t("workbenchArchives.open")}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          disabled={disabled}
          aria-label={t("workbenchExplorer.refresh")}
          onClick={() =>
            void client.invalidateQueries({
              queryKey: ["workbench-library-vpks"],
            })
          }>
          <ArrowClockwiseIcon />
        </Button>
      </div>
      {open.error ? (
        <p role='alert' className='px-3 pb-2 text-xs text-destructive'>
          {open.error.message}
        </p>
      ) : null}
      {external.map((vpk) => (
        <button
          type='button'
          key={vpk.filePath}
          disabled={disabled}
          title={vpk.filePath}
          aria-pressed={activePath === vpk.filePath}
          className={`block w-full truncate px-3 py-2 text-left font-mono text-xs hover:bg-accent disabled:opacity-50 ${activePath === vpk.filePath ? "bg-accent" : ""}`}
          onClick={() => onOpen(vpk)}>
          {vpk.label}
        </button>
      ))}
      <details>
        <summary className='cursor-pointer px-3 py-2 text-xs font-medium'>
          {t("workbenchArchives.library", { count: mods.length })}
        </summary>
        {mods.length === 0 ? (
          <p className='px-3 pb-3 text-xs text-muted-foreground'>
            {t("workbenchArchives.noMods")}
          </p>
        ) : null}
        {mods.map((mod) => (
          <LibraryVpkRow
            key={mod.id}
            mod={mod}
            disabled={disabled}
            activePath={activePath}
            onOpen={onOpen}
          />
        ))}
      </details>
    </details>
  );
};
