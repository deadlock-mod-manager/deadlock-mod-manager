import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ADDON_FILE_DRAG, readAddonDrag } from "@/lib/modding-file-drag";
import { useAddonFileDrop } from "./use-addon-file-drop";
import { useMemo, useState } from "react";
import { imageLocationCounts } from "@/lib/modding-image-locations";
import { ImageLocationWarning } from "./image-location-warning";
import { useTranslation } from "react-i18next";
import type { ModdingFile } from "@/types/generated/ModdingFile";
import type { BlenderAddonStatus } from "@/types/generated/BlenderAddonStatus";
import { BlenderSetupRequest } from "./blender-setup-request";
import {
  FileBranch,
  type FileAction,
  type ExternalFileAction,
  type AddonTreeProps,
} from "./addon-file-branch";

export const AddonFileTree = (props: AddonTreeProps) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const drop = useAddonFileDrop(props);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [operation, setOperation] = useState<{
    action: FileAction;
    file: ModdingFile;
  } | null>(null);
  const [name, setName] = useState("");
  const [blenderRequest, setBlenderRequest] = useState<{
    path: string;
    status: BlenderAddonStatus;
  } | null>(null);
  const root =
    props.hierarchy === "content"
      ? props.addon.contentPath
      : props.addon.gamePath;
  const imageScan = useQuery({
    queryKey: [
      "workbench-files",
      props.addon.id,
      props.hierarchy,
      { check: "image-locations" },
      props.revision,
    ],
    queryFn: () =>
      invoke<string[]>("scan_modding_image_locations", {
        addonId: props.addon.id,
        hierarchy: props.hierarchy,
      }),
    enabled: props.hierarchy === "content",
    staleTime: 30_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const imageWarnings = useMemo(
    () => imageLocationCounts(imageScan.data ?? []),
    [imageScan.data],
  );
  const external = useMutation({
    mutationFn: async ({
      action,
      path,
    }: {
      action: ExternalFileAction;
      path: string;
    }) => {
      const fullPath = await join(root, path);
      if (action === "open") await openPath(fullPath);
      else if (action === "reveal") await revealItemInDir(fullPath);
      else if (action === "swapAudio") {
        const extension = path.split(".").pop()?.toLowerCase() ?? "mp3";
        const sourcePath = await openDialog({
          title: t("workbenchExplorer.swapAudioTitle", {
            file: path.split("/").pop(),
          }),
          multiple: false,
          directory: false,
          filters: [
            {
              name: t("workbenchExplorer.audioFormat", {
                format: extension.toUpperCase(),
              }),
              extensions: [extension],
            },
          ],
        });
        if (!sourcePath) return;
        await invoke("swap_modding_audio", {
          addonId: props.addon.id,
          hierarchy: props.hierarchy,
          path,
          sourcePath,
        });
        await Promise.all([
          client.invalidateQueries({
            queryKey: ["workbench-files", props.addon.id],
          }),
          client.invalidateQueries({
            queryKey: [
              "workbench-audio",
              props.addon.id,
              props.hierarchy,
              path,
            ],
          }),
        ]);
        toast.success(
          t("workbenchExplorer.audioSwapped", { file: path.split("/").pop() }),
        );
      } else if (action === "blender") {
        setBlenderRequest(null);
        const status = await invoke<BlenderAddonStatus>(
          "open_modding_blender",
          {
            addonId: props.addon.id,
            hierarchy: props.hierarchy,
            path,
          },
        );
        if (!status.ready) setBlenderRequest({ path, status });
      } else await writeText(action === "copyFull" ? fullPath : path);
    },
  });
  const mutateFile = useMutation({
    mutationKey: ["workbench-files-change", props.addon.id],
    mutationFn: async () => {
      if (!operation) return;
      const directory = operation.file.path.split("/").slice(0, -1).join("/");
      const path =
        operation.action === "createFile" || operation.action === "createFolder"
          ? [operation.file.path, name].filter(Boolean).join("/")
          : operation.file.path;
      await invoke("change_modding_file", {
        addonId: props.addon.id,
        hierarchy: props.hierarchy,
        action: operation.action,
        path,
        destination:
          operation.action === "rename"
            ? [directory, name].filter(Boolean).join("/")
            : null,
      });
    },
    onSuccess: async () => {
      setOperation(null);
      props.onChanged();
      await client.invalidateQueries({
        queryKey: ["workbench-files", props.addon.id],
      });
    },
  });
  const prepare = (action: FileAction, file: ModdingFile) => {
    if (props.readOnly) return;
    mutateFile.reset();
    setOperation({ action, file });
    setName(action === "rename" ? file.name : "");
  };
  const rootEntry: ModdingFile = {
    path: "",
    name: "",
    directory: true,
    size: BigInt(0),
  };
  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${dropTarget === "" ? "bg-primary/10 ring-1 ring-inset ring-ring" : ""}`}
      onDragOver={(event) => {
        if (drop.busy || operation || !props.dropEnabled) return;
        if (
          event.dataTransfer.types.includes("Files") ||
          event.dataTransfer.types.includes(ADDON_FILE_DRAG)
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
            "Files",
          )
            ? "copy"
            : "move";
          setDropTarget("");
        }
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDropTarget(null);
      }}
      onDrop={(event) => {
        if (!props.dropEnabled) return;
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(null);
        if (drop.busy || operation || !props.dropEnabled) return;
        const files = Array.from(event.dataTransfer.files);
        if (files.length) {
          drop.copy.mutate(files);
          return;
        }
        const payload = readAddonDrag(
          event.dataTransfer.getData(ADDON_FILE_DRAG),
        );
        if (
          payload?.addonId === props.addon.id &&
          payload.hierarchy === props.hierarchy
        )
          drop.move.mutate({ source: payload.path, folder: "" });
      }}>
      {!props.readOnly ? (
        <div
          className='flex items-center gap-1 border-b px-2 py-1'
          inert={drop.busy}>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => prepare("createFile", rootEntry)}>
            {t("workbenchExplorer.createFile")}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => prepare("createFolder", rootEntry)}>
            {t("workbenchExplorer.createFolder")}
          </Button>
        </div>
      ) : null}
      {props.hierarchy === "content" ? (
        <div className='border-b px-2 py-1.5 text-xs'>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='ghost'
              disabled={imageScan.isFetching || drop.busy}
              onClick={() => void imageScan.refetch()}>
              {t(
                imageScan.isFetching
                  ? "workbenchImages.scanning"
                  : "workbenchImages.scan",
              )}
            </Button>
            {imageScan.data?.length ? (
              <>
                <span className='text-destructive' role='status'>
                  {t("workbenchImages.issues", {
                    count: imageScan.data.length,
                  })}
                </span>
                <ImageLocationWarning count={imageScan.data.length} directory />
              </>
            ) : imageScan.data && !imageScan.error ? (
              <span role='status' className='text-muted-foreground'>
                {t("workbenchImages.valid")}
              </span>
            ) : null}
          </div>
          {imageScan.error ? (
            <p role='alert' className='pt-1 text-destructive'>
              {String(imageScan.error)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        className='min-h-0 flex-1 overflow-auto py-1'
        inert={drop.busy}
        role='group'
        aria-label={t("workbenchExplorer.files")}>
        <FileBranch
          {...props}
          directory=''
          imageWarnings={imageWarnings}
          depth={0}
          dropTarget={dropTarget}
          onDragTarget={setDropTarget}
          disabled={drop.busy}
          onMove={(source, folder) => drop.move.mutate({ source, folder })}
          onAction={prepare}
          onExternal={(action, path) => {
            if (!external.isPending) external.mutate({ action, path });
          }}
        />
      </div>
      <p
        className='truncate border-t px-3 py-2 font-mono text-[10px] text-muted-foreground'
        title={root}>
        {root}
      </p>
      {external.isPending && external.variables?.action === "blender" ? (
        <p role='status' className='p-2 text-xs text-muted-foreground'>
          {t("workbenchExplorer.checkingBlender")}
        </p>
      ) : null}
      {blenderRequest ? (
        <BlenderSetupRequest
          key={blenderRequest.path}
          addonId={props.addon.id}
          hierarchy={props.hierarchy}
          path={blenderRequest.path}
          status={blenderRequest.status}
          onClose={() => setBlenderRequest(null)}
        />
      ) : null}
      <p
        role='status'
        className='border-t px-3 py-2 text-[11px] text-muted-foreground'>
        {t(
          props.readOnly
            ? "workbenchCompare.readOnly"
            : drop.busy
              ? "workbenchExplorer.changingFiles"
              : props.sourceDrops
                ? "workbenchCompare.dropHint"
                : "workbenchExplorer.dropHint",
        )}
      </p>
      {drop.copy.error || drop.move.error ? (
        <p role='alert' className='p-2 text-xs text-destructive'>
          {drop.copy.error?.message ?? drop.move.error?.message}
        </p>
      ) : null}
      {external.error ? (
        <p role='alert' className='p-2 text-xs text-destructive'>
          {external.error.message}
        </p>
      ) : null}
      <Dialog
        open={operation !== null}
        onOpenChange={(open) => {
          if (!open && !mutateFile.isPending) setOperation(null);
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {operation ? t(`workbenchExplorer.${operation.action}`) : ""}
            </DialogTitle>
            <DialogDescription>
              {operation?.action === "delete"
                ? t("workbenchExplorer.deleteDescription")
                : t("workbenchExplorer.nameDescription")}
            </DialogDescription>
          </DialogHeader>
          <p className='break-all font-mono text-xs'>
            {operation?.file.path || root}
          </p>
          {operation?.action !== "delete" ? (
            <Input
              autoFocus
              aria-label={t("workbenchExplorer.fileName")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}
          <Button
            variant={operation?.action === "delete" ? "destructive" : "default"}
            disabled={
              mutateFile.isPending ||
              (operation?.action !== "delete" &&
                (!name.trim() || /[/\\]/.test(name)))
            }
            onClick={() => mutateFile.mutate()}>
            {t("common.confirm")}
          </Button>
          {mutateFile.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {mutateFile.error.message}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
