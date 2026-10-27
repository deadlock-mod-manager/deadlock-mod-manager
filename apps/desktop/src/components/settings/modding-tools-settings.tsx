import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ModdingToolPath } from "@/components/settings/modding-tool-path";
import type { ModdingSdkStatus } from "@/types/generated/ModdingSdkStatus";
import type { ModdingTool } from "@/types/generated/ModdingTool";
import type { ModdingToolsConfig } from "@/types/generated/ModdingToolsConfig";

const CONFIG_KEY = ["modding-tools-config"];

const ModdingToolsForm = ({ config }: { config: ModdingToolsConfig }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(config);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const save = useMutation({
    mutationFn: () => invoke("save_modding_tools_config", { config: draft }),
    onSuccess: () => {
      queryClient.setQueryData(CONFIG_KEY, draft);
      toast.success(t("moddingTools.saved"));
    },
  });
  const inspect = useMutation({
    mutationFn: () => invoke<ModdingSdkStatus>("inspect_modding_sdk"),
  });
  const launch = useMutation({
    mutationFn: (tool: ModdingTool) => invoke("launch_modding_tool", { tool }),
    onSuccess: () => toast.success(t("moddingTools.launchRequested")),
  });
  const busy = save.isPending || inspect.isPending || launch.isPending;
  const report = inspect.data;
  const ready = report?.compatible && !dirty;
  const error = [save, inspect, launch].reduce((latest, current) =>
    current.submittedAt > latest.submittedAt ? current : latest,
  ).error;
  const setPath = (key: keyof ModdingToolsConfig, path: string) => {
    setDraft((previous) => ({ ...previous, [key]: path }));
  };

  return (
    <div className='space-y-5'>
      <p className='max-w-prose text-sm text-muted-foreground'>
        {t("moddingTools.description")}
      </p>
      <Button asChild variant='outline'>
        <Link to='/workbench'>{t("moddingTools.openWorkbench")}</Link>
      </Button>
      <ModdingToolPath
        id='modding-prepared-sdk'
        label={t("moddingTools.preparedSdk")}
        value={draft.preparedSdk}
        directory
        disabled={busy}
        onChange={(path) => setPath("preparedSdk", path)}
      />
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={busy || !ready}
          onClick={() => launch.mutate("modelDoc")}>
          {t("moddingTools.openModelDoc")}
        </Button>
        <Button
          variant='outline'
          disabled={busy || !ready}
          onClick={() => launch.mutate("assetBrowser")}>
          {t("moddingTools.openAssetBrowser")}
        </Button>
        <Button
          variant='outline'
          disabled={busy || dirty || !draft.preparedSdk}
          onClick={() => inspect.mutate()}>
          {inspect.isPending
            ? t("moddingTools.checking")
            : t("moddingTools.checkSdk")}
        </Button>
      </div>
      <div aria-live='polite' className='text-sm'>
        {inspect.isPending ? (
          <p className='text-muted-foreground'>{t("moddingTools.checking")}</p>
        ) : report && !dirty ? (
          <div className='space-y-2'>
            <p>
              {report.compatible
                ? t("moddingTools.compatible", { count: report.checkedModules })
                : t("moddingTools.incompatible", {
                    count: report.differentModules.length,
                  })}
            </p>
            {!report.compatible ? (
              <details className='text-xs text-muted-foreground'>
                <summary className='cursor-pointer'>
                  {t("moddingTools.showDifferences")}
                </summary>
                <ul className='mt-2 max-h-40 overflow-auto font-mono'>
                  {report.differentModules.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p className='text-muted-foreground'>
            {t("moddingTools.checkBeforeLaunch")}
          </p>
        )}
        {error ? (
          <p role='alert' className='mt-2 text-destructive'>
            {error.message}
          </p>
        ) : null}
      </div>
      <details className='space-y-3 border-t pt-4'>
        <summary className='cursor-pointer text-sm font-medium'>
          {t("moddingTools.sdkSetup")}
        </summary>
        <p className='max-w-prose text-xs text-muted-foreground'>
          {t("moddingTools.setupDescription")}
        </p>
        <ModdingToolPath
          id='modding-csdk'
          label={t("moddingTools.csdk")}
          value={draft.csdk}
          directory
          disabled={busy}
          onChange={(path) => setPath("csdk", path)}
        />
        <ModdingToolPath
          id='modding-proton'
          label={t("moddingTools.proton")}
          value={draft.proton}
          directory={false}
          disabled={busy}
          onChange={(path) => setPath("proton", path)}
        />
        <p className='text-xs text-muted-foreground'>
          {t("moddingTools.protonDescription")}
        </p>
      </details>
      <div className='space-y-3 border-t pt-4'>
        <ModdingToolPath
          id='modding-source2-viewer'
          label={t("moddingTools.source2Viewer")}
          value={draft.source2Viewer}
          directory={false}
          disabled={busy}
          onChange={(path) => setPath("source2Viewer", path)}
        />
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={busy || dirty || !draft.source2Viewer}
            onClick={() => launch.mutate("source2Viewer")}>
            {t("moddingTools.openSource2Viewer")}
          </Button>
          <Button
            variant='outline'
            disabled={busy || !ready || !draft.source2Viewer}
            onClick={() => launch.mutate("source2ViewerAssets")}>
            {t("moddingTools.browseSdkAssets")}
          </Button>
        </div>
      </div>
      <ModdingToolPath
        id='modding-blender'
        label={t("workbenchExplorer.blenderPath")}
        value={draft.blender}
        directory={false}
        disabled={busy}
        onChange={(path) => setPath("blender", path)}
      />
      <div className='flex items-center gap-3 border-t pt-4'>
        <Button disabled={busy || !dirty} onClick={() => save.mutate()}>
          {t("moddingTools.save")}
        </Button>
        {dirty ? (
          <p className='text-xs text-muted-foreground'>
            {t("moddingTools.unsaved")}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const ModdingToolsSettings = () => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => invoke<ModdingToolsConfig>("get_modding_tools_config"),
  });
  if (query.isPending) return <Skeleton className='h-48 w-full' />;
  if (query.isError)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t("moddingTools.loadFailed")}
      </p>
    );
  return (
    <ModdingToolsForm key={JSON.stringify(query.data)} config={query.data} />
  );
};
