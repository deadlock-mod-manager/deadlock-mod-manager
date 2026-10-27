import { Button } from "@deadlock-mods/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import {
  ArrowClockwiseIcon,
  PlusIcon,
  PlayIcon,
  HammerIcon,
} from "@phosphor-icons/react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  emptyWorkspaceView,
  type WorkspaceView,
} from "@/lib/modding-workspace";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { BatchToolsDialog } from "./batch-tools-dialog";
import { AddonFileTree } from "./addon-file-tree";
import { AssetImportDialog } from "./asset-import-dialog";
import { ParticleColorsDialog } from "./particle-colors-dialog";
import { usePackAndTest } from "./use-pack-and-test";
import { useAddonImageCompiler } from "./use-addon-image-compiler";

const AddonPreview = lazy(() =>
  import("./addon-preview").then((module) => ({
    default: module.AddonPreview,
  })),
);

export const OpenAddon = ({
  addon,
  workspaceId,
  onDirtyChange,
  readOnly = false,
  sourceDrops = false,
  initialView = emptyWorkspaceView(),
  onViewChange,
}: {
  addon: ModdingAddon;
  workspaceId: string;
  readOnly?: boolean;
  sourceDrops?: boolean;
  initialView?: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const { t } = useTranslation();
  const [batchOpen, setBatchOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hierarchy, setHierarchy] = useState<ModdingHierarchy>(
    initialView.hierarchy,
  );
  const [selected, setSelected] = useState(initialView.path);
  const [importOpen, setImportOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: async () => {
      if (!readOnly)
        await invoke<number>("prepare_modding_addon_files", {
          addonId: addon.id,
        });
    },
    onSuccess: () => setRevision((previous) => previous + 1),
  });
  const launch = useMutation({
    mutationFn: () => invoke("launch_modding_addon", { addonId: addon.id }),
  });
  const pack = usePackAndTest(addon, () =>
    setRevision((previous) => previous + 1),
  );
  const compile = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: (paths: string[] | null) =>
      invoke<string>("compile_modding_addon", { addonId: addon.id, paths }),
    onSuccess: () => setRevision((previous) => previous + 1),
  });
  const changingFiles =
    useIsMutating({ mutationKey: ["workbench-files-change", addon.id] }) > 0;
  const busy = pack.isPending || compile.isPending || changingFiles || dirty;
  const canCompileFile =
    hierarchy === "content" &&
    /\.(vmdl|vmesh|vpcf|vmat|vdata|vnmskel|vnmclip|vnmgraph|vsndevts|vsnd|vtex)$/i.test(
      selected,
    );
  const imageWatchError = useAddonImageCompiler(addon.id, !readOnly, () => {
    if (!dirty) setRevision((previous) => previous + 1);
  });
  const error =
    pack.error ??
    compile.error ??
    launch.error ??
    refresh.error ??
    imageWatchError;
  useEffect(() => {
    onViewChange?.({ ...initialView, hierarchy, path: selected });
  }, [hierarchy, selected, initialView, onViewChange]);
  useEffect(() => {
    onDirtyChange(busy || batchOpen || importOpen || colorsOpen);
  }, [busy, batchOpen, importOpen, colorsOpen, onDirtyChange]);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
        <div className='min-w-0'>
          <h2 className='truncate text-sm font-semibold'>{addon.name}</h2>
          <p className='text-[11px] text-muted-foreground'>
            {t(
              readOnly
                ? "workbenchCompare.readOnly"
                : "workbenchExplorer.editingOriginal",
            )}
          </p>
        </div>
        {!readOnly ? (
          <div className='flex flex-wrap items-center gap-1'>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => setColorsOpen(true)}>
              {t("particleColors.title")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => setBatchOpen(true)}>
              {t("workbenchAuthoring.batchTools")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy || launch.isPending}
              onClick={() => launch.mutate()}>
              {t("workbenchExplorer.openTools")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => setImportOpen(true)}>
              <PlusIcon />
              {t("workbenchExplorer.addFiles")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => compile.mutate(null)}>
              <HammerIcon />
              {t(
                compile.isPending && !compile.variables
                  ? "workbenchExplorer.compilingOnly"
                  : "workbenchExplorer.compile",
              )}
            </Button>
            {canCompileFile ? (
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                title={t("workbenchExplorer.compileSelected", {
                  path: selected,
                })}
                onClick={() => compile.mutate([selected])}>
                <HammerIcon />
                {t(
                  compile.isPending && compile.variables
                    ? "workbenchExplorer.compilingOnly"
                    : "workbenchExplorer.compileFile",
                )}
              </Button>
            ) : null}
            <Button size='sm' disabled={busy} onClick={() => pack.mutate()}>
              <PlayIcon />
              {t(
                pack.isPending
                  ? `workbenchExplorer.${pack.phase}`
                  : "workbenchExplorer.packTest",
              )}
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role='alert' className='border-b px-3 py-2 text-sm text-destructive'>
          {String(error)}
        </p>
      ) : null}
      {compile.data && !busy ? (
        <p
          role='status'
          className='border-b px-3 py-2 text-xs text-muted-foreground'>
          {t("workbenchExplorer.compiled")}
        </p>
      ) : null}
      {pack.data ? (
        <p
          role='status'
          className='border-b px-3 py-2 text-xs text-muted-foreground'>
          {t("workbenchExplorer.testStarted", { count: pack.data.fileCount })}
        </p>
      ) : null}
      <ResizablePanelGroup
        direction='horizontal'
        autoSaveId='workbench-files-preview'
        className='min-h-0 flex-1'>
        <ResizablePanel defaultSize={53} minSize={25}>
          <section
            className='flex h-full min-h-0 flex-col'
            aria-label={t("workbenchExplorer.files")}>
            <div className='flex h-11 items-center justify-between gap-2 border-b px-2'>
              <div
                className='flex items-center rounded-md border p-0.5'
                role='group'
                aria-label={t("workbenchExplorer.hierarchy")}>
                {(["content", "game"] satisfies ModdingHierarchy[]).map(
                  (value) => (
                    <Button
                      key={value}
                      size='sm'
                      className='h-7 px-3'
                      disabled={busy || readOnly}
                      variant={hierarchy === value ? "secondary" : "ghost"}
                      aria-pressed={hierarchy === value}
                      onClick={() => {
                        setHierarchy(value);
                        setSelected("");
                      }}>
                      {t(`workbenchExplorer.${value}`)}
                    </Button>
                  ),
                )}
              </div>
              <Button
                size='icon'
                variant='ghost'
                aria-label={t("workbenchExplorer.refresh")}
                disabled={busy}
                onClick={() => refresh.mutate()}>
                <ArrowClockwiseIcon />
              </Button>
            </div>
            <p className='border-b px-3 py-1.5 text-[11px] text-muted-foreground'>
              {t(
                readOnly
                  ? "workbenchCompare.localFiles"
                  : hierarchy === "content"
                    ? "workbenchExplorer.contentDescription"
                    : "workbenchExplorer.gameDescription",
              )}
            </p>
            <div className='min-h-0 flex-1' inert={busy}>
              <AddonFileTree
                key={`${addon.id}:${hierarchy}`}
                addon={addon}
                workspaceId={workspaceId}
                hierarchy={hierarchy}
                readOnly={readOnly}
                sourceDrops={sourceDrops}
                dropEnabled={!busy && !importOpen && !readOnly}
                selected={selected}
                onSelect={setSelected}
                onChanged={() => setRevision((previous) => previous + 1)}
                revision={revision}
              />
            </div>
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={47} minSize={25}>
          <Suspense
            fallback={<p className='p-4 text-sm'>{t("common.loading")}</p>}>
            <AddonPreview
              addon={addon}
              path={selected}
              hierarchy={hierarchy}
              revision={revision}
              onDirtyChange={(value) => {
                setDirty(value);
                onDirtyChange(value);
              }}
              onSaved={() => setRevision((previous) => previous + 1)}
            />
          </Suspense>
        </ResizablePanel>
      </ResizablePanelGroup>
      {colorsOpen ? (
        <ParticleColorsDialog
          addon={addon}
          onClose={() => setColorsOpen(false)}
          onSaved={() => setRevision((previous) => previous + 1)}
        />
      ) : null}
      {batchOpen ? (
        <BatchToolsDialog
          addon={addon}
          hierarchy={hierarchy}
          onClose={() => setBatchOpen(false)}
          onChanged={() => setRevision((previous) => previous + 1)}
        />
      ) : null}
      {importOpen ? (
        <AssetImportDialog
          addon={addon}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            compile.reset();
            pack.reset();
            setRevision((previous) => previous + 1);
          }}
        />
      ) : null}
    </div>
  );
};
