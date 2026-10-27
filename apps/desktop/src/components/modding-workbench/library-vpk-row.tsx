import { WORKSPACE_SOURCE_DRAG } from "@/lib/modding-workspace";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";

interface Props {
  mod: { id: string; name: string };
  disabled: boolean;
  activePath?: string;
  onOpen: (vpk: ModdingLibraryVpk) => void;
}

export const LibraryVpkRow = ({ mod, disabled, activePath, onOpen }: Props) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const vpks = useQuery({
    queryKey: ["workbench-library-vpks", mod.id],
    queryFn: () =>
      invoke<ModdingLibraryVpk[]>("list_modding_library_vpks", {
        modId: mod.id,
      }),
    enabled: expanded,
    staleTime: 60_000,
  });
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary
        className='cursor-pointer truncate px-3 py-2 text-xs'
        title={mod.name}>
        {mod.name}
      </summary>
      <div className='pb-1 pl-3'>
        {vpks.isPending ? (
          <p role='status' className='px-3 py-2 text-xs text-muted-foreground'>
            {t("common.loading")}
          </p>
        ) : null}
        {vpks.error ? (
          <p role='alert' className='px-3 py-2 text-xs text-destructive'>
            {vpks.error.message}
          </p>
        ) : null}
        {vpks.data?.length === 0 ? (
          <p className='px-3 py-2 text-xs text-muted-foreground'>
            {t("workbenchArchives.noVpks")}
          </p>
        ) : null}
        {vpks.data?.map((vpk) => (
          <button
            key={vpk.filePath}
            draggable={!disabled}
            onDragStart={(event) => {
              const value = JSON.stringify({
                kind: "archive",
                filePath: vpk.filePath,
                label: vpk.label,
              });
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(WORKSPACE_SOURCE_DRAG, value);
              event.dataTransfer.setData("text/plain", value);
            }}
            type='button'
            disabled={disabled}
            title={vpk.filePath}
            aria-pressed={activePath === vpk.filePath}
            className={`block w-full truncate px-3 py-2 text-left font-mono text-[11px] hover:bg-accent disabled:opacity-50 ${activePath === vpk.filePath ? "bg-accent" : ""}`}
            onClick={() => onOpen(vpk)}>
            {vpk.label}
          </button>
        ))}
      </div>
    </details>
  );
};
