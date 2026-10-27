import { Button } from "@deadlock-mods/ui/components/button";
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
import PageTitle from "@/components/shared/page-title";
import type { ModdingSetupStatus } from "@/types/generated/ModdingSetupStatus";
import type { ModdingSdkStatus } from "@/types/generated/ModdingSdkStatus";
import type { ModdingToolsConfig } from "@/types/generated/ModdingToolsConfig";

const ModdingWorkbench = () => {
  const { t } = useTranslation();
  const [comparing, setComparing] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
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
    queryKey: ["modding-sdk", config.data?.preparedSdk],
    queryFn: () => invoke<ModdingSdkStatus>("inspect_modding_sdk"),
    enabled: !!config.data,
    retry: false,
  });
  const tools = useQuery({
    queryKey: ["modding-setup"],
    queryFn: () => invoke<ModdingSetupStatus>("get_modding_setup_status"),
  });
  return (
    <div className='flex h-full min-h-0 flex-col gap-3 px-4 pb-4'>
      <PageTitle
        title={t("moddingWorkbench.title")}
        subtitle={t("moddingWorkbench.description")}
      />
      <div className='flex shrink-0 flex-wrap items-center justify-between gap-3'>
        <p role='status' className='text-sm'>
          {sdk.isFetching
            ? t("moddingTools.checking")
            : sdk.data?.compatible
              ? t("moddingWorkbench.sdkReady")
              : t("moddingWorkbench.sdkRequired")}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={!sdk.data?.compatible}
            onClick={() => setVariantsOpen(true)}>
            {t("workbenchAuthoring.variantBuilds")}
          </Button>
          {comparing || detached ? (
            <Button
              size='sm'
              variant='outline'
              disabled={comparisonDirty || popout.isPending}
              onClick={() => popout.mutate()}>
              {t(
                detached ? "workbenchCompare.focus" : "workbenchCompare.popout",
              )}
            </Button>
          ) : null}
          <Button
            size='sm'
            variant='outline'
            disabled={detached || (comparisonDirty && comparing)}
            onClick={() => setComparing(!comparing)}>
            {t(
              comparing
                ? "workbenchAuthoring.closeComparison"
                : "workbenchAuthoring.compare",
            )}
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link to='/settings/tools'>
              {t("moddingWorkbench.advancedSettings")}
            </Link>
          </Button>
        </div>
      </div>
      {config.data && !(sdk.data?.compatible && tools.data?.cliReady) ? (
        <details className='shrink-0 rounded-md border p-3'>
          <summary className='cursor-pointer text-sm font-medium'>
            {t("moddingWorkbench.setupTitle")}
          </summary>
          <div className='max-h-80 overflow-auto pt-3'>
            <WorkbenchSetup key={config.data.csdk} config={config.data} />
          </div>
        </details>
      ) : null}
      <ResizablePanelGroup direction='horizontal' className='min-h-0 flex-1'>
        <ResizablePanel
          minSize={30}
          defaultSize={comparing && !detached ? 50 : 100}>
          <AddonWorkspace
            addonsEnabled={!!sdk.data?.compatible && !!tools.data?.cliReady}
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
                addonsEnabled={!!sdk.data?.compatible && !!tools.data?.cliReady}
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
