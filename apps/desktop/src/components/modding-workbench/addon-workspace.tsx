import { Button } from "@deadlock-mods/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import {
  ArrowClockwiseIcon,
  FolderIcon,
  PlusIcon,
  ArrowsLeftRightIcon,
} from "@phosphor-icons/react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ADDON_FILE_DRAG, readAddonDrag } from "@/lib/modding-file-drag";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  emptyWorkspace,
  workspaceForSource,
  sourceKey,
  WORKSPACE_SOURCE_DRAG,
  type WorkspaceSnapshot,
  type WorkspaceView,
  type WorkspaceSource,
} from "@/lib/modding-workspace";
import { captureWorkspaceDrop } from "@/lib/modding-workspace-drop";
import { useWorkspaceDrop } from "./use-workspace-drop";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";
import { ArchiveBrowser } from "./archive-browser";
import { VpkSources } from "./vpk-sources";
import { CreateAddonDialog } from "./create-addon-dialog";
import { OpenAddon } from "./open-addon";

export const AddonWorkspace = ({
  addonsEnabled,
  onDirtyChange,
  initialSnapshot,
  onSnapshotChange,
  comparison = false,
}: {
  addonsEnabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  initialSnapshot?: WorkspaceSnapshot;
  onSnapshotChange?: (snapshot: WorkspaceSnapshot) => void;
  comparison?: boolean;
}) => {
  const { t } = useTranslation();
  const [workspaceId] = useState(() => crypto.randomUUID());
  const [createOpen, setCreateOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const exporting = useIsMutating({ mutationKey: ["workbench-export"] }) > 0;
  const working =
    useIsMutating({
      predicate: (mutation) =>
        [
          "workbench-build",
          "workbench-import",
          "workbench-files-change",
        ].includes(String(mutation.options.mutationKey?.[0])),
    }) > 0;
  const [snapshot, setSnapshot] = useState(initialSnapshot ?? emptyWorkspace);
  const recent = snapshot.recent;
  const [dragging, setDragging] = useState(false);
  const source = snapshot.source;
  const archive = source?.kind === "archive" ? source : null;
  const setArchive = (value: ModdingLibraryVpk) =>
    setSnapshot(
      workspaceForSource({
        kind: "archive",
        filePath: value.filePath,
        label: value.label,
      }),
    );
  const updateView = useCallback(
    (view: WorkspaceView) =>
      setSnapshot((previous) =>
        JSON.stringify(previous.view) === JSON.stringify(view)
          ? previous
          : { ...previous, view },
      ),
    [],
  );
  const reported = useRef(JSON.stringify(snapshot));
  useEffect(() => {
    const serialized = JSON.stringify(snapshot);
    if (serialized !== reported.current) {
      reported.current = serialized;
      onSnapshotChange?.(snapshot);
    }
  }, [snapshot, onSnapshotChange]);

  const open = useMutation({
    mutationFn: async (addonId: string) => {
      await invoke<number>("prepare_modding_addon_files", { addonId });
      return addonId;
    },
    onSuccess: (id) => {
      setSnapshot(
        workspaceForSource({
          kind: "addon",
          addonId: id,
          hierarchy: "content",
          path: "",
        }),
      );
    },
  });
  const addons = useQuery({
    queryKey: ["workbench-addons"],
    enabled: addonsEnabled,
    queryFn: () => invoke<ModdingAddon[]>("list_modding_addons"),
  });
  const addon =
    source?.kind === "local"
      ? source.addon
      : source?.kind === "addon"
        ? addons.data?.find((candidate) => candidate.id === source.addonId)
        : undefined;
  const busy = dirty || working || exporting || open.isPending || createOpen;
  const openSources = (sources: WorkspaceSource[]) => {
    if (sources[0])
      setSnapshot({ ...workspaceForSource(sources[0]), recent: sources });
  };
  const drop = useWorkspaceDrop(openSources);
  useEffect(() => {
    onDirtyChange?.(busy || drop.isPending);
  }, [busy, drop.isPending, onDirtyChange]);
  const acceptDrop = (transfer: DataTransfer) =>
    transfer.types.includes(WORKSPACE_SOURCE_DRAG) ||
    (comparison &&
      (transfer.types.includes(ADDON_FILE_DRAG) ||
        transfer.types.includes("Files") ||
        transfer.types.includes("text/uri-list")));

  return (
    <section
      className={`relative flex h-full min-h-0 flex-col ${dragging ? "ring-2 ring-primary" : ""}`}
      aria-label={t(
        comparison ? "workbenchCompare.workspace" : "workbenchExplorer.addons",
      )}
      onDragOverCapture={(event) => {
        if (!acceptDrop(event.dataTransfer)) return;
        event.preventDefault();
        if (!event.dataTransfer.types.includes(ADDON_FILE_DRAG))
          event.stopPropagation();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
        setDragging(!busy);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDropCapture={(event) => {
        if (!acceptDrop(event.dataTransfer)) return;
        const file = readAddonDrag(event.dataTransfer.getData(ADDON_FILE_DRAG));
        if (file?.workspaceId === workspaceId) {
          setDragging(false);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (busy || drop.isPending) {
          toast.error(t("workbenchCompare.finishEditing"));
          return;
        }
        drop.mutate(captureWorkspaceDrop(event.dataTransfer));
      }}>
      {comparison ? (
        <div className='flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground'>
          <span>
            {t(drop.isPending ? "common.loading" : "workbenchCompare.dropHint")}
          </span>
          {recent.length > 1 ? (
            <select
              aria-label={t("workbenchCompare.droppedSources")}
              disabled={busy}
              value={source ? sourceKey(source) : ""}
              onChange={(event) => {
                const next = recent.find(
                  (entry) => sourceKey(entry) === event.target.value,
                );
                if (next) setSnapshot({ ...workspaceForSource(next), recent });
              }}
              className='max-w-64 rounded border bg-background p-1'>
              {recent.map((entry) => (
                <option key={sourceKey(entry)} value={sourceKey(entry)}>
                  {entry.kind === "archive"
                    ? entry.label
                    : entry.kind === "local"
                      ? entry.path || entry.addon.name
                      : addons.data?.find((item) => item.id === entry.addonId)
                          ?.name || entry.addonId}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      {drop.error ? (
        <p role='alert' className='p-2 text-xs text-destructive'>
          {drop.error.message}
        </p>
      ) : null}
      <ResizablePanelGroup
        direction='horizontal'
        autoSaveId={
          comparison ? "workbench-comparison-content" : "workbench-addons"
        }
        className='min-h-0 flex-1 rounded-lg border bg-background/95'>
        {!comparison ? (
          <>
            <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
              <aside
                className='flex h-full min-h-0 flex-col bg-muted/20'
                aria-label={t("workbenchExplorer.addons")}>
                <div className='flex h-12 shrink-0 items-center justify-between border-b px-3'>
                  <h2 className='text-sm font-semibold'>
                    {t("workbenchExplorer.addons")}
                  </h2>
                  <div className='flex gap-0.5'>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='size-7'
                      disabled={!addonsEnabled || dirty}
                      aria-label={t("workbenchAuthoring.createAddon")}
                      title={t("workbenchAuthoring.createAddon")}
                      onClick={() => setCreateOpen(true)}>
                      <PlusIcon />
                    </Button>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='size-7'
                      disabled={!addonsEnabled || addons.isFetching}
                      aria-label={t("workbenchExplorer.refresh")}
                      title={t("workbenchExplorer.refresh")}
                      onClick={() => void addons.refetch()}>
                      <ArrowClockwiseIcon />
                    </Button>
                  </div>
                </div>
                <div className='min-h-0 flex-1 overflow-auto py-2'>
                  {[
                    ...new Set(
                      addons.data?.map((candidate) => candidate.sdkRoot),
                    ),
                  ].map((root) => (
                    <div key={root} className='mb-3 px-2'>
                      <p
                        title={root}
                        className='truncate px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
                        {root.split(/[/\\]/).pop()}
                      </p>
                      {addons.data
                        ?.filter((candidate) => candidate.sdkRoot === root)
                        .map((candidate) => (
                          <button
                            type='button'
                            draggable={!busy}
                            onDragStart={(event) => {
                              const value = JSON.stringify({
                                kind: "addon",
                                addonId: candidate.id,
                                hierarchy: "content",
                                path: "",
                              });
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData(
                                WORKSPACE_SOURCE_DRAG,
                                value,
                              );
                              event.dataTransfer.setData("text/plain", value);
                            }}
                            key={candidate.id}
                            disabled={busy || drop.isPending}
                            aria-pressed={addon?.id === candidate.id}
                            title={`${candidate.name}\n${candidate.sdkRoot}`}
                            className={`mb-0.5 flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-ring ${addon?.id === candidate.id ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`}
                            onClick={() => open.mutate(candidate.id)}>
                            <FolderIcon
                              aria-hidden
                              weight='duotone'
                              className='size-4 shrink-0'
                            />
                            <span className='truncate font-medium'>
                              {candidate.name}
                            </span>
                          </button>
                        ))}
                    </div>
                  ))}
                  {addons.error ? (
                    <p role='alert' className='p-3 text-sm text-destructive'>
                      {addons.error.message}
                    </p>
                  ) : null}
                  {addonsEnabled &&
                  !addons.isPending &&
                  !addons.data?.length ? (
                    <p className='p-3 text-sm text-muted-foreground'>
                      {t("workbenchExplorer.noAddons")}
                    </p>
                  ) : null}
                  {!addonsEnabled ? (
                    <p className='p-3 text-xs text-muted-foreground'>
                      {t("moddingWorkbench.sdkRequired")}
                    </p>
                  ) : null}
                  <VpkSources
                    disabled={busy || drop.isPending}
                    activePath={archive?.filePath}
                    onOpen={setArchive}
                  />
                </div>
                <p className='flex items-center gap-2 border-t px-3 py-2.5 text-[10px] text-muted-foreground'>
                  <ArrowsLeftRightIcon
                    aria-hidden
                    className='size-3 shrink-0'
                  />
                  {t(
                    open.isPending
                      ? "workbenchExplorer.preparingAddon"
                      : "workbenchExplorer.openAddonHint",
                  )}
                </p>
                {open.error ? (
                  <p role='alert' className='p-3 text-xs text-destructive'>
                    {open.error.message}
                  </p>
                ) : null}
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        ) : null}
        <ResizablePanel defaultSize={comparison ? 100 : 80} minSize={55}>
          {archive ? (
            <ArchiveBrowser
              key={archive.filePath}
              initialView={snapshot.view}
              onViewChange={updateView}
              mode={{
                kind: "browse",
                archivePath: archive.filePath,
                label: archive.label,
              }}
            />
          ) : addon && (addonsEnabled || source?.kind === "local") ? (
            <OpenAddon
              key={`${addon.id}:${source?.kind === "archive" ? "" : source?.path}:${source?.kind === "addon" ? source.hierarchy : "game"}`}
              addon={addon}
              workspaceId={workspaceId}
              readOnly={source?.kind === "local"}
              sourceDrops={comparison}
              initialView={snapshot.view}
              onViewChange={updateView}
              onDirtyChange={setDirty}
            />
          ) : (
            <Empty className='h-full border-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <FolderIcon weight='duotone' />
                </EmptyMedia>
                <EmptyTitle>
                  {t(
                    comparison
                      ? "workbenchCompare.workspace"
                      : "workbenchGuide.emptyTitle",
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {t(
                    comparison
                      ? "workbenchCompare.emptyHint"
                      : "workbenchGuide.emptyDescription",
                  )}
                </EmptyDescription>
              </EmptyHeader>
              {!comparison && addonsEnabled ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setCreateOpen(true)}>
                  <PlusIcon />
                  {t("workbenchAuthoring.createAddon")}
                </Button>
              ) : null}
            </Empty>
          )}
        </ResizablePanel>
        {createOpen ? (
          <CreateAddonDialog
            onClose={() => setCreateOpen(false)}
            onCreated={(addon) => {
              setSnapshot(
                workspaceForSource({
                  kind: "addon",
                  addonId: addon.id,
                  hierarchy: "content",
                  path: "",
                }),
              );
            }}
          />
        ) : null}
      </ResizablePanelGroup>
    </section>
  );
};
