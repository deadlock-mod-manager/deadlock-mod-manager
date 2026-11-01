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

export function HistoryRow({
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
