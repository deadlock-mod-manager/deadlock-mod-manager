import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
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
  DotsThreeIcon,
  CaretDownIcon,
  FolderOpenIcon,
  FolderSimpleIcon,
  SquaresFourIcon,
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
import { ScanRepairPanel } from "./scan-repair-panel";
import { AddonAssetGrid } from "./addon-asset-grid";

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
  const [repairOpen, setRepairOpen] = useState(false);
  const [assetView, setAssetView] = useState(true);
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
    onDirtyChange(busy || batchOpen || importOpen || colorsOpen || repairOpen);
  }, [busy, batchOpen, importOpen, colorsOpen, repairOpen, onDirtyChange]);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b bg-background/60 px-4 py-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <FolderOpenIcon
            aria-hidden
            weight='duotone'
            className='size-5 shrink-0 text-primary'
          />
          <h2 className='truncate text-sm font-semibold'>{addon.name}</h2>
          {readOnly ? (
            <span className='text-xs text-muted-foreground'>
              {t("workbenchCompare.readOnly")}
            </span>
          ) : null}
        </div>
        {!readOnly && !repairOpen ? (
          <div className='flex flex-wrap items-center gap-1'>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => setColorsOpen(true)}>
              {t("particleColors.title")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size='sm' variant='outline' disabled={busy}>
                  <HammerIcon />
                  {t(
                    compile.isPending
                      ? "workbenchExplorer.compilingOnly"
                      : "workbenchExplorer.compile",
                  )}
                  <CaretDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  disabled={!canCompileFile}
                  onSelect={() => compile.mutate([selected])}>
                  {t("workbenchExplorer.compileFile")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => compile.mutate(null)}>
                  {t("workbenchRepair.compile")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='icon'
                  variant='ghost'
                  disabled={busy}
                  aria-label={t("workbenchAssets.moreActions")}
                  title={t("workbenchAssets.moreActions")}>
                  <DotsThreeIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <PlusIcon className='mr-2 size-4' />
                  {t("workbenchExplorer.addFiles")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRepairOpen(true)}>
                  {t("workbenchRepair.title")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setBatchOpen(true)}>
                  {t("workbenchAuthoring.batchTools")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={launch.isPending}
                  onSelect={() => launch.mutate()}>
                  {t("workbenchExplorer.openTools")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      {repairOpen ? (
        <ScanRepairPanel
          addon={addon}
          onClose={() => setRepairOpen(false)}
          onChanged={() => {
            compile.reset();
            pack.reset();
            setRevision((previous) => previous + 1);
          }}
        />
      ) : null}
      {!repairOpen ? (
        <ResizablePanelGroup
          direction='horizontal'
          autoSaveId='workbench-files-preview'
          className='min-h-0 flex-1'>
          <ResizablePanel defaultSize={44} minSize={25}>
            <section
              className='flex h-full min-h-0 flex-col'
              aria-label={t("workbenchExplorer.files")}>
              <div className='flex min-h-12 flex-wrap items-center justify-between gap-1 border-b bg-background/60 px-2'>
                {!readOnly ? (
                  <Tabs
                    value={assetView ? "assets" : "files"}
                    onValueChange={(value) => setAssetView(value === "assets")}>
                    <TabsList
                      className='h-11 gap-1 rounded-none bg-transparent p-0'
                      aria-label={t("workbenchAssets.view")}>
                      {(["assets", "files"] as const).map((value) => (
                        <TabsTrigger
                          key={value}
                          value={value}
                          disabled={busy}
                          className='relative h-11 gap-2 rounded-none bg-transparent px-2 text-xs data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary after:opacity-0 data-[state=active]:after:opacity-100'>
                          {value === "assets" ? (
                            <SquaresFourIcon
                              aria-hidden
                              weight='duotone'
                              className='size-4'
                            />
                          ) : (
                            <FolderSimpleIcon
                              aria-hidden
                              weight='duotone'
                              className='size-4'
                            />
                          )}
                          {t(
                            value === "assets"
                              ? "workbenchAssets.assets"
                              : "workbenchAssets.files",
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : (
                  <span className='px-2 text-xs text-muted-foreground'>
                    {t("workbenchCompare.localFiles")}
                  </span>
                )}
                <div className='flex items-center gap-1'>
                  {!readOnly ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={busy}
                          className='text-muted-foreground'
                          aria-label={t("workbenchExplorer.hierarchy")}
                          title={t(
                            hierarchy === "content"
                              ? "workbenchExplorer.contentDescription"
                              : "workbenchExplorer.gameDescription",
                          )}>
                          {t(`workbenchExplorer.${hierarchy}`)}
                          <CaretDownIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuRadioGroup
                          value={hierarchy}
                          onValueChange={(value) => {
                            if (value === "content" || value === "game") {
                              setHierarchy(value);
                              setSelected("");
                            }
                          }}>
                          <DropdownMenuRadioItem value='content'>
                            {t("workbenchAssets.sourceFiles")}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value='game'>
                            {t("workbenchAssets.compiledFiles")}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <Button
                    size='icon'
                    variant='ghost'
                    aria-label={t("workbenchExplorer.refresh")}
                    title={t("workbenchExplorer.refresh")}
                    disabled={busy}
                    onClick={() => refresh.mutate()}>
                    <ArrowClockwiseIcon />
                  </Button>
                </div>
              </div>
              <div className='min-h-0 flex-1' inert={busy}>
                {assetView && !readOnly ? (
                  <AddonAssetGrid
                    addon={addon}
                    hierarchy={hierarchy}
                    revision={revision}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
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
                )}
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={56} minSize={25}>
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
      ) : null}
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
