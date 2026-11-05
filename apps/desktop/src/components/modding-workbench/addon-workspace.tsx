import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import { FolderIcon } from "@phosphor-icons/react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { ADDON_FILE_DRAG } from "@/lib/modding-file-drag";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  emptyWorkspace,
  workspaceForSource,
  sourceKey,
  type WorkspaceSnapshot,
  type WorkspaceView,
  type WorkspaceSource,
} from "@/lib/modding-workspace";
import {
  handlesWorkspaceDrop,
  workspaceDropRoute,
  captureWorkspaceDrop,
} from "@/lib/modding-workspace-drop";
import { useWorkspaceDrop } from "./use-workspace-drop";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";
import { ArchiveBrowser } from "./archive-browser";
import { WorkbenchSidebar, type WorkbenchSourceTab } from "./workbench-sidebar";
import { CreateAddonDialog } from "./create-addon-dialog";
import { OpenAddon } from "./open-addon";
import { WorkbenchEmptyState } from "./workbench-empty-state";
import { useWorkbenchArchives } from "./use-workbench-archives";

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
  const [sourceTab, setSourceTab] = useState<WorkbenchSourceTab | null>(null);
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
  const setArchive = (value: ModdingLibraryVpk) => {
    setSourceTab("mods");
    setSnapshot(
      workspaceForSource({
        kind: "archive",
        filePath: value.filePath,
        label: value.label,
      }),
    );
  };
  const archives = useWorkbenchArchives(setArchive);
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
      setSourceTab("addons");
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
  const busy =
    dirty ||
    working ||
    exporting ||
    open.isPending ||
    archives.browse.isPending ||
    createOpen;
  const openSources = (sources: WorkspaceSource[]) => {
    if (sources[0]) {
      setSourceTab(sources[0].kind === "archive" ? "mods" : "addons");
      setSnapshot({ ...workspaceForSource(sources[0]), recent: sources });
    }
  };
  const drop = useWorkspaceDrop(openSources);
  useEffect(() => {
    onDirtyChange?.(busy || drop.isPending);
  }, [busy, drop.isPending, onDirtyChange]);
  const handleDragOver = (
    event: DragEvent<HTMLElement>,
    phase: "capture" | "bubble",
  ) => {
    const route = workspaceDropRoute(
      event.dataTransfer,
      comparison,
      workspaceId,
    );
    if (!handlesWorkspaceDrop(route, phase, event.defaultPrevented)) return;
    event.preventDefault();
    if (!event.dataTransfer.types.includes(ADDON_FILE_DRAG))
      event.stopPropagation();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    setDragging(!busy);
  };
  const handleDrop = (
    event: DragEvent<HTMLElement>,
    phase: "capture" | "bubble",
  ) => {
    setDragging(false);
    const route = workspaceDropRoute(
      event.dataTransfer,
      comparison,
      workspaceId,
    );
    if (!handlesWorkspaceDrop(route, phase, event.defaultPrevented)) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy || drop.isPending) {
      toast.error(t("workbenchCompare.finishEditing"));
      return;
    }
    drop.mutate(captureWorkspaceDrop(event.dataTransfer));
  };

  return (
    <section
      className={`relative flex h-full min-h-0 flex-col ${dragging ? "ring-2 ring-primary" : ""}`}
      aria-label={t(
        comparison ? "workbenchCompare.workspace" : "workbenchExplorer.addons",
      )}
      onDragOverCapture={(event) => handleDragOver(event, "capture")}
      onDragOver={(event) => {
        handleDragOver(event, "bubble");
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDropCapture={(event) => handleDrop(event, "capture")}
      onDrop={(event) => {
        handleDrop(event, "bubble");
        event.preventDefault();
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
        deferResize
        direction='horizontal'
        autoSaveId={
          comparison ? "workbench-comparison-content" : "workbench-addons"
        }
        className='min-h-0 flex-1 overflow-hidden bg-background'>
        {!comparison ? (
          <>
            <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
              <WorkbenchSidebar
                tab={sourceTab ?? (addonsEnabled ? "addons" : "mods")}
                onTabChange={setSourceTab}
                addons={addons}
                addonsEnabled={addonsEnabled}
                selectedAddonId={addon?.id}
                activeArchivePath={archive?.filePath}
                archives={archives}
                busy={busy || drop.isPending}
                preparing={open.isPending}
                openError={open.error}
                onCreate={() => setCreateOpen(true)}
                onOpenAddon={(id) => open.mutate(id)}
                onOpenArchive={setArchive}
              />
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
          ) : comparison ? (
            <Empty className='h-full border-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <FolderIcon weight='duotone' />
                </EmptyMedia>
                <EmptyTitle>{t("workbenchCompare.workspace")}</EmptyTitle>
                <EmptyDescription>
                  {t("workbenchCompare.emptyHint")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <WorkbenchEmptyState
              addonsEnabled={addonsEnabled}
              disabled={busy || drop.isPending}
              opening={archives.browse.isPending}
              onOpenArchive={() => archives.browse.mutate()}
              onCreateAddon={() => setCreateOpen(true)}
            />
          )}
        </ResizablePanel>
        {createOpen ? (
          <CreateAddonDialog
            onClose={() => setCreateOpen(false)}
            onCreated={(addon) => {
              setSourceTab("addons");
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
