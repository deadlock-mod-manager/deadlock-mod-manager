import { PluginCallError } from "@deadlock-mods/plugin-sdk";
import { InfoIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  type BridgeStatus,
  type CommandError,
  deployBuild,
  fetchStatus,
  saveSettings,
  saveUiState,
} from "./bridge";
import { BuildHistory } from "./build-history";
import type { DeployControl } from "./build-state";
import { profileLabel } from "./format";
import { LatestBuild } from "./latest-build";
import type { Problem } from "./problems";
import { Problems } from "./problems";
import { Workspace } from "./workspace";

const STATUS_KEY = ["status"] as const;

const toCommandError = (error: Error): CommandError =>
  error instanceof PluginCallError
    ? { code: error.code, message: error.message }
    : { code: "unexpected", message: error.message };

export function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    refetchInterval: 2000,
  });
  const deploy = useMutation({
    mutationFn: deployBuild,
    onSuccess: (next) => queryClient.setQueryData(STATUS_KEY, next),
    onSettled: () => queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });
  const configure = useMutation({
    mutationFn: saveSettings,
    onSuccess: (settings) =>
      queryClient.setQueryData<BridgeStatus>(STATUS_KEY, (current) =>
        current ? { ...current, settings } : current,
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });
  const saveUi = useMutation({
    mutationFn: saveUiState,
    onSuccess: (ui) =>
      queryClient.setQueryData<BridgeStatus>(STATUS_KEY, (current) =>
        current ? { ...current, ui } : current,
      ),
  });

  const data = status.data;
  const problems: Problem[] = [];
  if (status.error) {
    problems.push({
      label: t("problems.request"),
      error: toCommandError(status.error),
    });
  }
  if (data?.watchError) {
    problems.push({ label: t("problems.watch"), error: data.watchError });
  }
  if (deploy.error) {
    problems.push({
      label: t("problems.deploy"),
      error: toCommandError(deploy.error),
    });
  } else if (data?.deployError) {
    problems.push({ label: t("problems.deploy"), error: data.deployError });
  }
  if (data?.grantsError) {
    problems.push({ label: t("problems.grants"), error: data.grantsError });
  }
  if (data?.listError) {
    problems.push({ label: t("problems.list"), error: data.listError });
  }
  if (configure.error) {
    problems.push({
      label: t("problems.request"),
      error: toCommandError(configure.error),
    });
  }
  if (saveUi.error) {
    problems.push({
      label: t("problems.request"),
      error: toCommandError(saveUi.error),
    });
  }

  const header = (
    <header className='header'>
      <h1>{t("title")}</h1>
      <p>{t("description")}</p>
    </header>
  );

  if (!data) {
    return (
      <main className='page'>
        {header}
        <Problems problems={problems} />
        {status.isPending && (
          <p className='hint' role='status'>
            {t("status.loading")}
          </p>
        )}
      </main>
    );
  }

  const [latest, ...older] = data.builds;
  const profileFolder = data.grants?.profile?.folder ?? null;
  const deployControl: DeployControl = {
    profileName: profileFolder ? profileLabel(profileFolder) : null,
    canDeploy: !deploy.isPending && data.pendingHash === null,
    deployingHash: deploy.isPending ? (deploy.variables ?? null) : null,
    onDeploy: (hash) => deploy.mutate(hash),
  };
  const expanded = data.ui.historyExpanded;

  return (
    <main className='page'>
      {header}
      <div className='layout'>
        <div className='layout__main'>
          <Problems problems={problems} />
          {data.pendingHash && (
            <p className='hint' role='status'>
              {t("status.pending")}
            </p>
          )}
          <LatestBuild build={latest} deploy={deployControl} />
          <BuildHistory
            total={data.builds.length}
            older={older}
            expanded={expanded}
            isSaving={saveUi.isPending}
            deploy={deployControl}
            onToggle={() => saveUi.mutate({ historyExpanded: !expanded })}
          />
        </div>
        <aside className='layout__side'>
          <Workspace
            status={data}
            isSaving={configure.isPending}
            onSettingsChange={(next) => configure.mutate(next)}
          />
          <p className='side-hint'>
            <InfoIcon />
            <span>{t("access.hint")}</span>
          </p>
        </aside>
      </div>
    </main>
  );
}
