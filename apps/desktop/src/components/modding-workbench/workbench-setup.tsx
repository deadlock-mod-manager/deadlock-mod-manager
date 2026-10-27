import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SteamAuthorizationCode } from "@/components/modding-workbench/steam-authorization-code";
import { ModdingToolPath } from "@/components/settings/modding-tool-path";
import type { ModdingSetupStatus } from "@/types/generated/ModdingSetupStatus";
import type { ModdingToolsConfig } from "@/types/generated/ModdingToolsConfig";

export const WorkbenchSetup = ({ config }: { config: ModdingToolsConfig }) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [csdk, setCsdk] = useState(config.csdk);
  const setup = useMutation({
    mutationFn: async () => {
      await invoke("save_modding_tools_config", {
        config: { ...config, csdk },
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
    downloaderDownload: t("moddingWorkbench.setup.downloaderDownload"),
    steamAuthorization: t("moddingWorkbench.setup.steamAuthorization"),
    runtimeDownload: t("moddingWorkbench.setup.runtimeDownload"),
    preparing: t("moddingWorkbench.setup.preparing"),
    ready: t("moddingWorkbench.setup.ready"),
    failed: t("moddingWorkbench.setup.failed"),
  };
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
          {status.data ? labels[status.data.phase] : null}
        </span>
      </div>
      {status.data?.qrLines.length ? (
        <div className='space-y-2'>
          <p className='text-sm'>{t("moddingWorkbench.scanSteamQr")}</p>
          <SteamAuthorizationCode
            lines={status.data.qrLines}
            label={t("moddingWorkbench.steamQr")}
          />
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
