import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  CheckCircleIcon,
  ColumnsIcon,
  DotsThreeIcon,
  GearIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  emptyWorkspace,
  readWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "@/lib/modding-workspace";
import type { ModdingComparisonWindow } from "@/types/generated/ModdingComparisonWindow";
import { useCallback, useEffect, useState } from "react";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@deadlock-mods/ui/components/resizable";
import { VariantBuildDialog } from "@/components/modding-workbench/variant-build-dialog";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AddonWorkspace } from "@/components/modding-workbench/addon-workspace";
import { WorkbenchSetup } from "@/components/modding-workbench/workbench-setup";
import { WorkbenchGuide } from "@/components/modding-workbench/workbench-guide";
import type { ModdingSetupStatus } from "@/types/generated/ModdingSetupStatus";
import type { ModdingSdkStatus } from "@/types/generated/ModdingSdkStatus";
import type { ModdingToolsConfig } from "@/types/generated/ModdingToolsConfig";

const ModdingWorkbench = () => {
  const { t } = useTranslation();
  const [comparing, setComparing] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [comparisonDirty, setComparisonDirty] = useState(false);
  const [snapshot, setSnapshot] = useState(emptyWorkspace);
  const [comparisonKey, setComparisonKey] = useState(0);
  const updateSnapshot = useCallback(
    (value: WorkspaceSnapshot) => setSnapshot(value),
    [],
  );
  const client = useQueryClient();
  const comparisonWindow = useQuery({
    queryKey: ["comparison-window"],
    queryFn: () =>
      invoke<ModdingComparisonWindow>("get_modding_comparison_window"),
    refetchOnWindowFocus: false,
  });
  const detached = comparisonWindow.data?.detached ?? false;
  useEffect(() => {
    const subscription = listen<ModdingComparisonWindow>(
      "workbench-comparison-changed",
      ({ payload }) => {
        client.setQueryData(["comparison-window"], payload);
      },
    );
    return () => {
      void subscription.then((unlisten) => unlisten());
    };
  }, [client]);
  useEffect(() => {
    const state = comparisonWindow.data;
    if (state && !state.detached && state.snapshot) {
      setSnapshot(readWorkspaceSnapshot(state.snapshot));
      setComparisonKey((key) => key + 1);
      setComparisonDirty(false);
      setComparing(true);
    }
  }, [comparisonWindow.data]);
  const popout = useMutation({
    mutationFn: () =>
      invoke("open_modding_comparison_window", {
        snapshot: JSON.stringify(snapshot),
      }),
  });
  const config = useQuery({
    queryKey: ["modding-tools-config"],
    queryFn: () => invoke<ModdingToolsConfig>("get_modding_tools_config"),
  });
  const sdk = useQuery({
    queryKey: ["modding-sdk", config.data?.sdk],
    queryFn: () => invoke<ModdingSdkStatus>("inspect_modding_sdk"),
    enabled: !!config.data,
    retry: false,
  });
  const tools = useQuery({
    queryKey: ["modding-setup"],
    queryFn: () => invoke<ModdingSetupStatus>("get_modding_setup_status"),
  });
  const checkingTools = config.isPending || sdk.isFetching || tools.isPending;
  const ready = !!sdk.data?.prepared && !!tools.data?.cliReady;
  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden bg-background'>
      <header className='flex h-11 shrink-0 items-center justify-between gap-3 border-b bg-card px-3'>
        <div className='min-w-0'>
          <h1 className='truncate text-sm font-semibold'>
            {t("moddingWorkbench.title")}
          </h1>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          <Button
            variant='ghost'
            size='sm'
            className='h-7'
            disabled={!config.data}
            aria-expanded={setupOpen}
            aria-controls='workbench-setup-form'
            aria-label={t("workbenchGuide.toolSetup")}
            title={t("workbenchGuide.toolSetup")}
            onClick={() => setSetupOpen(!setupOpen)}>
            {ready ? (
              <CheckCircleIcon className='text-primary' />
            ) : (
              <GearIcon />
            )}
            <span>
              {t(
                checkingTools
                  ? "moddingTools.checking"
                  : ready
                    ? "workbenchGuide.toolsReady"
                    : "workbenchGuide.toolSetup",
              )}
            </span>
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7'
            aria-label={t(
              comparing
                ? "workbenchAuthoring.closeComparison"
                : "workbenchAuthoring.compare",
            )}
            disabled={detached || (comparisonDirty && comparing)}
            onClick={() => setComparing(!comparing)}>
            <ColumnsIcon />
            <span className='hidden xl:inline'>
              {t(
                comparing
                  ? "workbenchAuthoring.closeComparison"
                  : "workbenchAuthoring.compare",
              )}
            </span>
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='size-7'
            aria-label={t("workbenchGuide.title")}
            title={t("workbenchGuide.title")}
            aria-expanded={guideOpen}
            aria-controls='workbench-guide'
            onClick={() => setGuideOpen(!guideOpen)}>
            <QuestionIcon />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size='icon'
                variant='ghost'
                className='size-7'
                aria-label={t("workbenchGuide.moreActions")}
                title={t("workbenchGuide.moreActions")}>
                <DotsThreeIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <Link to='/settings/tools'>
                  {t("moddingWorkbench.advancedSettings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!sdk.data?.prepared}
                onSelect={() => setVariantsOpen(true)}>
                {t("workbenchAuthoring.variantBuilds")}
              </DropdownMenuItem>
              {comparing || detached ? (
                <DropdownMenuItem
                  disabled={comparisonDirty || popout.isPending}
                  onSelect={() => popout.mutate()}>
                  {t(
                    detached
                      ? "workbenchCompare.focus"
                      : "workbenchCompare.popout",
                  )}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {config.data ? (
        <div
          id='workbench-setup-form'
          hidden={!setupOpen && !tools.data?.running}
          className='max-h-72 shrink-0 overflow-auto border-b bg-card p-4'>
          <WorkbenchSetup config={config.data} />
        </div>
      ) : null}
      {guideOpen ? <WorkbenchGuide expanded /> : null}
      <ResizablePanelGroup
        deferResize
        direction='horizontal'
        className='min-h-0 flex-1'>
        <ResizablePanel
          minSize={30}
          defaultSize={comparing && !detached ? 50 : 100}>
          <AddonWorkspace
            addonsEnabled={!!sdk.data?.prepared && !!tools.data?.cliReady}
          />
        </ResizablePanel>
        {comparing && !detached ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel minSize={30} defaultSize={50}>
              <AddonWorkspace
                key={comparisonKey}
                comparison
                initialSnapshot={snapshot}
                onSnapshotChange={updateSnapshot}
                addonsEnabled={!!sdk.data?.prepared && !!tools.data?.cliReady}
                onDirtyChange={setComparisonDirty}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      {variantsOpen ? (
        <VariantBuildDialog onClose={() => setVariantsOpen(false)} />
      ) : null}
    </div>
  );
};

export default ModdingWorkbench;
