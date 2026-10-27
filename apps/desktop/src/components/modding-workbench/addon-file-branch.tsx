import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@deadlock-mods/ui/components/context-menu";
import {
  CaretDownIcon,
  CaretRightIcon,
  FileIcon,
  FolderIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageLocationWarning } from "./image-location-warning";
import { ADDON_FILE_DRAG, readAddonDrag } from "@/lib/modding-file-drag";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingFile } from "@/types/generated/ModdingFile";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";

export type FileAction = "rename" | "delete" | "createFile" | "createFolder";
export type ExternalFileAction =
  | "open"
  | "reveal"
  | "copyFull"
  | "copyRelative"
  | "blender"
  | "swapAudio";
export interface AddonTreeProps {
  addon: ModdingAddon;
  workspaceId: string;
  hierarchy: ModdingHierarchy;
  selected: string;
  onSelect: (path: string) => void;
  revision: number;
  onChanged: () => void;
  dropEnabled: boolean;
  readOnly?: boolean;
  sourceDrops?: boolean;
}
interface BranchProps extends AddonTreeProps {
  imageWarnings: ReadonlyMap<string, number>;
  directory: string;
  depth: number;
  dropTarget: string | null;
  onDragTarget: (path: string | null) => void;
  onMove: (source: string, folder: string) => void;
  disabled: boolean;
  onAction: (action: FileAction, file: ModdingFile) => void;
  onExternal: (action: ExternalFileAction, path: string) => void;
}

export const FileBranch = ({
  directory,
  depth,
  onAction,
  onExternal,
  ...props
}: BranchProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    const parts = props.selected.split("/");
    return new Set(
      parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/")),
    );
  });
  const files = useQuery({
    queryKey: [
      "workbench-files",
      props.addon.id,
      props.hierarchy,
      directory,
      props.revision,
    ],
    queryFn: () =>
      invoke<ModdingFile[]>("list_modding_files", {
        addonId: props.addon.id,
        hierarchy: props.hierarchy,
        directory,
      }),
    staleTime: 30_000,
  });
  const toggle = (path: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <>
      {files.data?.map((file) => (
        <div key={file.path}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type='button'
                draggable={!props.disabled && !props.readOnly}
                disabled={props.disabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copyMove";
                  event.dataTransfer.setData(
                    ADDON_FILE_DRAG,
                    JSON.stringify({
                      addonId: props.addon.id,
                      workspaceId: props.workspaceId,
                      directory: file.directory,
                      hierarchy: props.hierarchy,
                      path: file.path,
                    }),
                  );
                }}
                onDragEnd={() => props.onDragTarget(null)}
                onDragOver={(event) => {
                  if (
                    !props.readOnly &&
                    event.dataTransfer.types.includes(ADDON_FILE_DRAG)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    props.onDragTarget(file.directory ? file.path : directory);
                  }
                }}
                onDrop={(event) => {
                  if (
                    props.readOnly ||
                    !event.dataTransfer.types.includes(ADDON_FILE_DRAG)
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  props.onDragTarget(null);
                  const payload = readAddonDrag(
                    event.dataTransfer.getData(ADDON_FILE_DRAG),
                  );
                  if (
                    payload?.addonId === props.addon.id &&
                    payload.hierarchy === props.hierarchy
                  ) {
                    props.onMove(
                      payload.path,
                      file.directory ? file.path : directory,
                    );
                    if (file.directory)
                      setExpanded((previous) =>
                        new Set(previous).add(file.path),
                      );
                  }
                }}
                aria-expanded={
                  file.directory ? expanded.has(file.path) : undefined
                }
                aria-pressed={props.selected === file.path}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                className={`${props.dropTarget === file.path ? "bg-primary/15 outline outline-1 outline-ring" : ""} flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-xs hover:bg-accent focus-visible:outline focus-visible:outline-ring ${props.selected === file.path ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                onClick={() => {
                  if (file.directory) toggle(file.path);
                  else props.onSelect(file.path);
                }}
                onDoubleClick={() => {
                  if (!file.directory) onExternal("open", file.path);
                }}>
                {file.directory ? (
                  expanded.has(file.path) ? (
                    <CaretDownIcon className='size-3 shrink-0' />
                  ) : (
                    <CaretRightIcon className='size-3 shrink-0' />
                  )
                ) : (
                  <span className='w-3 shrink-0' />
                )}
                {file.directory ? (
                  <FolderIcon className='size-4 shrink-0 text-foreground' />
                ) : (
                  <FileIcon className='size-4 shrink-0' />
                )}
                <span className='truncate' title={file.path}>
                  {file.name}
                </span>
                {props.imageWarnings.has(file.path) ? (
                  <ImageLocationWarning
                    count={props.imageWarnings.get(file.path) ?? 0}
                    directory={file.directory}
                  />
                ) : null}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onExternal("open", file.path)}>
                {t("workbenchExplorer.openDefault")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onExternal("reveal", file.path)}>
                {t("workbenchExplorer.reveal")}
              </ContextMenuItem>
              {!props.readOnly &&
              !file.directory &&
              /\.(dmx|vmdl|vmdl_c|vmesh_c)$/i.test(file.path) ? (
                <ContextMenuItem
                  onSelect={() => onExternal("blender", file.path)}>
                  {t("workbenchExplorer.openBlender")}
                </ContextMenuItem>
              ) : null}
              {!props.readOnly &&
              !file.directory &&
              /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.path) ? (
                <ContextMenuItem
                  onSelect={() => onExternal("swapAudio", file.path)}>
                  {t("workbenchExplorer.swapContents")}
                </ContextMenuItem>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => onExternal("copyFull", file.path)}>
                {t("workbenchExplorer.copyFull")}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => onExternal("copyRelative", file.path)}>
                {t("workbenchExplorer.copyRelative")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              {!props.readOnly && file.directory ? (
                <>
                  <ContextMenuItem
                    onSelect={() => onAction("createFile", file)}>
                    {t("workbenchExplorer.createFile")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => onAction("createFolder", file)}>
                    {t("workbenchExplorer.createFolder")}
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuItem
                disabled={props.readOnly}
                onSelect={() => onAction("rename", file)}>
                {t("workbenchExplorer.rename")}
              </ContextMenuItem>
              <ContextMenuItem
                className='text-destructive'
                disabled={props.readOnly}
                onSelect={() => onAction("delete", file)}>
                {t("workbenchExplorer.delete")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {file.directory && expanded.has(file.path) ? (
            <FileBranch
              {...props}
              directory={file.path}
              depth={depth + 1}
              onAction={onAction}
              onExternal={onExternal}
            />
          ) : null}
        </div>
      ))}
      {files.error ? (
        <p role='alert' className='p-3 text-xs text-destructive'>
          {files.error.message}
        </p>
      ) : null}
      {files.isPending ? (
        <p role='status' className='p-3 text-xs text-muted-foreground'>
          {t("common.loading")}
        </p>
      ) : null}
      {depth === 0 && files.data?.length === 0 ? (
        <p className='p-4 text-sm text-muted-foreground'>
          {t("workbenchExplorer.emptyAddon")}
        </p>
      ) : null}
    </>
  );
};
