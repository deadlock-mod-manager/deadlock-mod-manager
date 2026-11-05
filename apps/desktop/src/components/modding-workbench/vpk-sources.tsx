import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowClockwiseIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";
import { LibraryVpkRow } from "./library-vpk-row";

interface Props {
  disabled: boolean;
  activePath?: string;
  external: ModdingLibraryVpk[];
  opening: boolean;
  error: Error | null;
  onBrowse: () => void;
  onOpen: (vpk: ModdingLibraryVpk) => void;
}

export const VpkSources = ({
  disabled,
  activePath,
  external,
  opening,
  error,
  onBrowse,
  onOpen,
}: Props) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  return (
    <div>
      <div className='flex gap-1 border-b p-2'>
        <Button
          size='sm'
          variant='outline'
          className='min-w-0 flex-1'
          disabled={disabled || opening}
          isLoading={opening}
          onClick={onBrowse}>
          <FolderOpenIcon />
          {t("workbenchArchives.open")}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
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
      {error ? (
        <p role='alert' className='px-3 pb-2 text-xs text-destructive'>
          {error.message}
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
      <div className='py-2'>
        <p className='px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
          {t("workbenchHome.modsCount", { count: mods.length })}
        </p>
        {mods.length === 0 ? (
          <p className='px-3 pb-3 text-xs text-muted-foreground'>
            {t("workbenchArchives.noMods")}
          </p>
        ) : null}
        {mods.map((mod) => (
          <LibraryVpkRow
            key={mod.remoteId}
            mod={mod}
            disabled={disabled}
            activePath={activePath}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
};
