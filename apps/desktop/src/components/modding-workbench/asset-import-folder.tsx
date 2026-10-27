import {
  CaretDownIcon,
  CaretRightIcon,
  FolderIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { AssetImportCheckbox } from "./asset-import-checkbox";
import {
  archiveQueryKey,
  assetSelectionState,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";

interface Props {
  node: ModdingArchiveEntry;
  archivePath: string;
  directory: string;
  depth: number;
  expanded: ReadonlySet<string>;
  selection: AssetSelection;
  disabled: boolean;
  onExpand: (path: string) => void;
  onNavigate: (path: string) => void;
  onSelect: (node: ModdingArchiveEntry, selected: boolean) => void;
}

export const AssetImportFolder = ({ node, depth, ...props }: Props) => {
  const { t } = useTranslation();
  const open = props.expanded.has(node.path);
  const selected = props.directory === node.path;
  const reveal = useCallback(
    (element: HTMLButtonElement | null) => {
      if (selected && element) element.scrollIntoView({ block: "nearest" });
    },
    [selected],
  );
  const listing = useQuery({
    queryKey: archiveQueryKey(props.archivePath, node.path),
    queryFn: () =>
      invoke<ModdingArchiveEntry[]>("list_modding_archive_files", {
        directory: node.path,
        archivePath: props.archivePath,
        search: "",
      }),
    enabled: open,
    staleTime: 60_000,
  });
  return (
    <div
      role='treeitem'
      aria-expanded={open}
      aria-selected={props.directory === node.path}>
      <div
        className={`flex items-center gap-1 pr-2 text-xs ${props.directory === node.path ? "bg-accent" : "hover:bg-accent/50"}`}
        style={{ paddingLeft: depth * 14 + 4 }}>
        <button
          type='button'
          className='flex size-6 shrink-0 items-center justify-center'
          aria-label={t(
            open
              ? "workbenchExplorer.collapseFolder"
              : "workbenchExplorer.expandFolder",
            { folder: node.name },
          )}
          disabled={props.disabled}
          onClick={() => props.onExpand(node.path)}>
          {open ? <CaretDownIcon /> : <CaretRightIcon />}
        </button>
        <AssetImportCheckbox
          label={t("workbenchExplorer.selectFolder", {
            folder: node.path || node.name,
          })}
          checked={assetSelectionState(props.selection, node)}
          disabled={props.disabled || !node.fileCount}
          onCheckedChange={(checked) => props.onSelect(node, checked)}
        />
        <button
          ref={reveal}
          type='button'
          className='flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left'
          disabled={props.disabled}
          onClick={() => props.onNavigate(node.path)}
          title={node.path || node.name}>
          {node.path ? (
            <FolderIcon className='size-4 shrink-0 text-muted-foreground' />
          ) : (
            <PackageIcon className='size-4 shrink-0' />
          )}
          <span className='truncate'>{node.name}</span>
        </button>
      </div>
      {open ? (
        <div role='group'>
          {listing.data
            ?.filter((file) => file.directory)
            .map((child) => (
              <AssetImportFolder
                {...props}
                key={child.path}
                node={child}
                depth={depth + 1}
              />
            ))}
          {listing.error ? (
            <p role='alert' className='px-3 py-1 text-xs text-destructive'>
              {listing.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
