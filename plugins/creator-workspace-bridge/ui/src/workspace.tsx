import { CheckIcon, FileIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { type BridgeStatus, type Settings, type WatchState } from "./bridge";
import { profileLabel } from "./format";
import { Value } from "./value";

const WATCH_TONE = {
  ready: "ok",
  missing: "warn",
  invalid: "warn",
  changing: "neutral",
  waitingForMarker: "neutral",
  idle: "neutral",
} satisfies Record<WatchState | "idle", "ok" | "warn" | "neutral">;

type WorkspaceProps = {
  status: BridgeStatus;
  isSaving: boolean;
  onSettingsChange: (next: Settings) => void;
};

export function Workspace({
  status,
  isSaving,
  onSettingsChange,
}: WorkspaceProps) {
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
