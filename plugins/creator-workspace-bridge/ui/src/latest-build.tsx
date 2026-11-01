import {
  ArrowCounterClockwiseIcon,
  RocketLaunchIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Badge } from "./badge";
import { type BuildEntry } from "./bridge";
import { buildState } from "./build-state";
import type { DeployControl } from "./build-state";
import { formatBytes, formatStagedAt } from "./format";

export function LatestBuild({
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
