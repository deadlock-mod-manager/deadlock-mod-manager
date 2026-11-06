import { Progress } from "@deadlock-mods/ui/components/progress";
import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModdingToolPath } from "@/components/settings/modding-tool-path";
import type { ModdingSetupStatus } from "@/types/generated/ModdingSetupStatus";
import { formatByteSize } from "@deadlock-mods/shared";
import type { ModdingToolsConfig } from "@/types/generated/ModdingToolsConfig";

export const WorkbenchSetup = ({ config }: { config: ModdingToolsConfig }) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [csdk, setCsdk] = useState(config.sdk);
  const setup = useMutation({
    mutationFn: async () => {
      await invoke("save_modding_tools_config", {
        config: { ...config, sdk: csdk },
      });
      await invoke("setup_modding_workbench");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["modding-sdk"] });
      void client.invalidateQueries({ queryKey: ["modding-tools-config"] });
      void client.invalidateQueries({ queryKey: ["modding-setup"] });
    },
  });
  const status = useQuery({
    queryKey: ["modding-setup"],
    queryFn: () => invoke<ModdingSetupStatus>("get_modding_setup_status"),
    refetchInterval: (query) =>
      setup.isPending || query.state.data?.running ? 500 : false,
  });
  const cancel = useMutation({
    mutationFn: () => invoke("cancel_modding_setup"),
  });
  const busy = setup.isPending || status.data?.running === true;
  const labels = {
    idle: "",
    starting: t("moddingWorkbench.setup.starting"),
    cliDownload: t("moddingWorkbench.setup.cliDownload"),
    verifying: t("moddingWorkbench.setup.verifying"),
    extracting: t("moddingWorkbench.setup.extracting"),
    preparing: t("moddingWorkbench.setup.preparing"),
    ready: t("moddingWorkbench.setup.ready"),
    failed: t("moddingWorkbench.setup.failed"),
  };
  const phase =
    setup.isPending && !status.data?.running ? "starting" : status.data?.phase;
  const downloaded = Number(status.data?.downloadedBytes ?? 0);
  const total = Number(status.data?.totalBytes ?? 0);
  const percent =
    phase === "cliDownload" && total > 0
      ? Math.min(100, (downloaded / total) * 100)
      : null;
  return (
    <div className='space-y-3'>
      <p className='max-w-prose text-sm text-muted-foreground'>
        {t("moddingWorkbench.setupDescription")}
      </p>
      <div className='max-w-2xl'>
        <ModdingToolPath
          id='workbench-csdk'
          label={t("moddingTools.csdk")}
          value={csdk}
          directory
          disabled={busy}
          onChange={setCsdk}
        />
      </div>
      <div className='flex items-center gap-3'>
        <Button disabled={busy || !csdk} onClick={() => setup.mutate()}>
          {busy ? t("moddingWorkbench.settingUp") : t("moddingWorkbench.setUp")}
        </Button>
        {busy && status.data?.phase !== "preparing" ? (
          <Button
            variant='ghost'
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <span role='status' className='text-sm text-muted-foreground'>
          {phase ? labels[phase] : null}
        </span>
      </div>
      {busy ? (
        <div className='max-w-2xl space-y-2' aria-busy='true'>
          {percent === null ? (
            <div
              role='progressbar'
              aria-label={
                phase ? labels[phase] : t("moddingWorkbench.setup.starting")
              }
              className='h-1.5 overflow-hidden rounded-full bg-primary/20'>
              <div className='h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none' />
            </div>
          ) : (
            <Progress
              aria-label={labels.cliDownload}
              className='h-1.5 rounded-full'
              value={percent}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          )}
          <div className='flex items-center justify-between gap-3 text-xs text-muted-foreground'>
            <span
              className='min-w-0 truncate'
              title={status.data?.currentFile ?? undefined}>
              {phase === "cliDownload"
                ? t(
                    total > 0
                      ? "moddingWorkbench.setup.downloadProgress"
                      : "moddingWorkbench.setup.downloaded",
                    {
                      downloaded: formatByteSize(downloaded),
                      total: formatByteSize(total),
                    },
                  )
                : phase === "preparing"
                  ? status.data?.currentFile
                  : null}
            </span>
            <span className='shrink-0 tabular-nums'>
              {t("moddingWorkbench.setup.elapsed", {
                seconds: Number(status.data?.elapsedSeconds ?? 0),
              })}
            </span>
          </div>
          {phase === "preparing" && status.data ? (
            <p className='text-xs text-muted-foreground'>
              {t("moddingWorkbench.setup.filesProgress", {
                count: Number(status.data.processedFiles),
                copied: formatByteSize(Number(status.data.copiedBytes)),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      {setup.error || status.data?.error || cancel.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {setup.error?.message ?? status.data?.error ?? cancel.error?.message}
        </p>
      ) : null}
    </div>
  );
};
