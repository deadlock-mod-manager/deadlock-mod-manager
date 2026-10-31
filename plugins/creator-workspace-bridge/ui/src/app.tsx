import { PluginCallError } from "@deadlock-mods/plugin-sdk";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  FileIcon,
  InfoIcon,
  RocketLaunchIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type BridgeStatus,
  type BuildEntry,
  type CommandError,
  deployBuild,
  fetchStatus,
  type Settings,
  saveSettings,
  saveUiState,
  type WatchState,
} from "./bridge";
import { formatBytes, formatStagedAt, profileLabel } from "./format";

const STATUS_KEY = ["status"] as const;
const HISTORY_LIMIT = 8;
/** Older builds listed before "Show older builds". */
const HISTORY_PREVIEW = 3;

type Problem = { label: string; error: CommandError };

type BuildState = "deployed" | "missing" | "ready" | "superseded";

const toCommandError = (error: Error): CommandError =>
  error instanceof PluginCallError
    ? { code: error.code, message: error.message }
    : { code: "unexpected", message: error.message };

const describeError = (t: TFunction, error: CommandError) =>
  t(`errors.${error.code}`, { defaultValue: error.message });

const buildState = (build: BuildEntry, isLatest: boolean): BuildState => {
  if (build.deployed) return "deployed";
  if (build.available === false) return "missing";
  return isLatest ? "ready" : "superseded";
};

function Problems({ problems }: { problems: Problem[] }) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <ul className='problems' role='alert'>
      {problems.map(({ label, error }) => (
        <li key={`${label}:${error.code}`} className='problem'>
          <span className='problem__label'>{label}</span>
          <span>{describeError(t, error)}</span>
        </li>
      ))}
    </ul>
  );
}

function Badge({ state, tinted }: { state: BuildState; tinted: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`badge badge--${state}${tinted ? " badge--tinted" : ""}`}>
      <span className='badge__dot' />
      {t(`build.${state}`)}
    </span>
  );
}

type DeployControl = {
  profileName: string | null;
  canDeploy: boolean;
  deployingHash: string | null;
  onDeploy: (hash: string) => void;
};

function LatestBuild({
  build,
  deploy,
}: {
  build: BuildEntry | undefined;
  deploy: DeployControl;
}) {
  const { t, i18n } = useTranslation();
  if (!build) {
    return (
      <section className='card card--latest' aria-labelledby='latest-heading'>
        <div className='card__head'>
          <h2 id='latest-heading'>{t("latest.heading")}</h2>
        </div>
        <p className='hint'>{t("latest.empty")}</p>
      </section>
    );
  }
  const state = buildState(build, true);
  const { profileName } = deploy;
  return (
    <section className='card card--latest' aria-labelledby='latest-heading'>
      <div className='card__head'>
        <h2 id='latest-heading'>{t("latest.heading")}</h2>
        <span className='spacer' />
        <Badge state={state} tinted />
      </div>
      <code
        className='latest__hash'
        aria-label={t("build.hash", { hash: build.hash })}>
        {build.hash}
      </code>
      <dl className='facts'>
        {build.resources !== null && (
          <div>
            <dt>{t("build.contents")}</dt>
            <dd>{t("build.resources", { count: build.resources })}</dd>
          </div>
        )}
        <div>
          <dt>{t("build.size")}</dt>
          <dd>{formatBytes(build.size, i18n.language)}</dd>
        </div>
        {build.stagedAt && (
          <div>
            <dt>{t("build.staged")}</dt>
            <dd>
              <time dateTime={build.stagedAt}>
                {formatStagedAt(t, build.stagedAt, i18n.language)}
              </time>
            </dd>
          </div>
        )}
      </dl>
      {profileName && (
        <div className='latest__actions'>
          <button
            type='button'
            className={
              build.deployed
                ? "button button--outline"
                : "button button--primary"
            }
            disabled={!deploy.canDeploy || build.available === false}
            onClick={() => deploy.onDeploy(build.hash)}>
            {build.deployed ? (
              <ArrowCounterClockwiseIcon />
            ) : (
              <RocketLaunchIcon />
            )}
            {deploy.deployingHash === build.hash
              ? t("actions.deploying")
              : t(build.deployed ? "actions.redeploy" : "actions.deploy", {
                  profile: profileName,
                })}
          </button>
          <p className='hint'>{t("actions.deployHint")}</p>
        </div>
      )}
    </section>
  );
}

function HistoryRow({
  build,
  deploy,
}: {
  build: BuildEntry;
  deploy: DeployControl;
}) {
  const { t, i18n } = useTranslation();
  return (
    <article className='history__row'>
      <span className='history__badge'>
        <Badge state={buildState(build, false)} tinted={false} />
      </span>
      <code
        className='history__hash'
        title={build.hash}
        aria-label={t("build.hash", { hash: build.hash })}>
        {build.hash.slice(0, 16)}
      </code>
      <span className='spacer' />
      {build.resources !== null && (
        <span className='history__fact'>
          {t("build.resources", { count: build.resources })}
        </span>
      )}
      <span className='history__fact'>
        {formatBytes(build.size, i18n.language)}
      </span>
      <span className='history__fact history__when'>
        {build.stagedAt && (
          <time dateTime={build.stagedAt}>
            {formatStagedAt(t, build.stagedAt, i18n.language)}
          </time>
        )}
      </span>
      {deploy.profileName && (
        <button
          type='button'
          className='button button--outline'
          disabled={!deploy.canDeploy || build.available === false}
          aria-label={t(
            build.deployed ? "actions.redeploy" : "actions.deploy",
            {
              profile: deploy.profileName,
            },
          )}
          onClick={() => deploy.onDeploy(build.hash)}>
          {build.deployed ? (
            <ArrowCounterClockwiseIcon />
          ) : (
            <RocketLaunchIcon />
          )}
          {deploy.deployingHash === build.hash
            ? t("actions.deploying")
            : t(
                build.deployed
                  ? "actions.redeployShort"
                  : "actions.deployShort",
              )}
        </button>
      )}
    </article>
  );
}

type BuildHistoryProps = {
  total: number;
  older: BuildEntry[];
  expanded: boolean;
  isSaving: boolean;
  deploy: DeployControl;
  onToggle: () => void;
};

function BuildHistory({
  total,
  older,
  expanded,
  isSaving,
  deploy,
  onToggle,
}: BuildHistoryProps) {
  const { t } = useTranslation();
  const visible = expanded ? older : older.slice(0, HISTORY_PREVIEW);
  return (
    <section className='card card--history' aria-labelledby='history-heading'>
      <div className='card__head history__head'>
        <h2 id='history-heading'>{t("history.heading")}</h2>
        <span className='spacer' />
        <span className='muted'>
          {t("history.count", { count: total, limit: HISTORY_LIMIT })}
        </span>
      </div>
      {older.length === 0 ? (
        <p className='hint history__empty'>{t("history.empty")}</p>
      ) : (
        <>
          <div id='history-list' className='history__list'>
            {visible.map((build) => (
              <HistoryRow key={build.hash} build={build} deploy={deploy} />
            ))}
          </div>
          {older.length > HISTORY_PREVIEW && (
            <div className='history__more'>
              <button
                type='button'
                className='button button--ghost'
                aria-expanded={expanded}
                aria-controls='history-list'
                disabled={isSaving}
                onClick={onToggle}>
                {expanded ? <CaretUpIcon /> : <CaretDownIcon />}
                {t(expanded ? "history.hide" : "history.show")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const WATCH_TONE = {
  ready: "ok",
  missing: "warn",
  invalid: "warn",
  changing: "neutral",
  waitingForMarker: "neutral",
  idle: "neutral",
} satisfies Record<WatchState | "idle", "ok" | "warn" | "neutral">;

function Value({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className='kv__value'>
      {icon}
      {children}
    </span>
  );
}

type WorkspaceProps = {
  status: BridgeStatus;
  isSaving: boolean;
  onSettingsChange: (next: Settings) => void;
};

function Workspace({ status, isSaving, onSettingsChange }: WorkspaceProps) {
  const { t } = useTranslation();
  const file = status.grants?.file ?? null;
  const profile = status.grants?.profile ?? null;
  const unknown = status.grants === null;
  const missing = t(unknown ? "grants.unavailable" : "grants.notGranted");
  const watch = status.watch ?? "idle";
  const markerChecked = status.settings.requireReadyMarker;
  return (
    <section
      className='card card--workspace'
      aria-labelledby='workspace-heading'>
      <h2 id='workspace-heading'>{t("grants.heading")}</h2>
      <div className='kv'>
        <span className='kv__label'>{t("grants.output")}</span>
        <Value icon={<FileIcon />}>
          {file ? (
            <span className='mono'>{file.name}</span>
          ) : (
            <span className='kv__missing'>{missing}</span>
          )}
        </Value>
      </div>
      <div className='kv'>
        <span className='kv__label'>{t("grants.profile")}</span>
        <Value icon={<UserCircleIcon />}>
          {profile ? (
            <span title={profile.folder}>{profileLabel(profile.folder)}</span>
          ) : (
            <span className='kv__missing'>{missing}</span>
          )}
        </Value>
      </div>
      {(!file || !profile) && <p className='hint'>{t("grants.configure")}</p>}
      {file && (
        <p className={`watch watch--${WATCH_TONE[watch]}`} role='status'>
          <span className='watch__pulse' />
          {t(`watch.${watch}`)}
        </p>
      )}
      <label className='marker'>
        <input
          type='checkbox'
          className='marker__input'
          checked={markerChecked}
          disabled={isSaving}
          onChange={(event) =>
            onSettingsChange({ requireReadyMarker: event.target.checked })
          }
        />
        <span className='marker__box' aria-hidden>
          {markerChecked && <CheckIcon weight='bold' />}
        </span>
        <span>
          {t("settings.readyMarker", {
            marker: `${file?.name ?? t("settings.output")}.ready`,
          })}
        </span>
      </label>
    </section>
  );
}

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
