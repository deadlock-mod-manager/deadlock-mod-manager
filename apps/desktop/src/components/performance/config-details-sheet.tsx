import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@deadlock-mods/ui/components/sheet";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  CalendarBlankIcon,
  CertificateIcon,
  GithubLogoIcon,
  GlobeIcon,
  TagIcon,
  UserIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  usePerfConfigList,
  useStoredRequestOptions,
} from "@/hooks/performance/use-perf-config-list";
import { usePerfResolve } from "@/hooks/performance/use-perf-queries";
import { getErrorMessage } from "@/lib/errors";
import {
  type ApplicableConfig,
  applyRequestFor,
  type PresetListItem,
  type UserListItem,
} from "@/lib/performance/config-list";
import { sameApplyOptions } from "@/lib/performance/overrides";
import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import { ApplyConfigButton } from "./configs/apply-config-button";
import { Chip } from "./configs/card-parts";
import { useOriginLabel } from "./configs/use-origin-label";
import { AuthorViewSettings } from "./details/author-view-settings";
import { CommunityDetails } from "./details/community-details";
import {
  DetailsHeader,
  ExternalLink,
  LinkChip,
} from "./details/details-header";
import { DetailsSection } from "./details/details-parts";
import { NotApplied } from "./details/not-applied";
import { VideoSettingsChecklist } from "./details/video-settings-checklist";
import { WhatItChanges } from "./details/what-it-changes";
import { usePerformanceUi } from "./performance-context";

const ApplicableHeader = ({
  item,
  config,
}: {
  item: PresetListItem | UserListItem;
  config: ApplicableConfig;
}) => {
  const { t, i18n } = useTranslation();
  const originLabel = useOriginLabel();
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  if (config.kind === "preset") {
    const { preset } = config;
    const versionLine = [
      preset.version,
      preset.updatedAt ? shortDate(preset.updatedAt) : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <DetailsHeader
        blurb={preset.blurb}
        chips={
          <>
            <Chip icon={<UserIcon aria-hidden />}>
              {t("performance.configs.by", { author: preset.author })}
            </Chip>
            {versionLine && (
              <Chip icon={<TagIcon aria-hidden />}>{versionLine}</Chip>
            )}
            {preset.source.kind === "github" && (
              <>
                <Chip icon={<CertificateIcon aria-hidden />}>
                  {preset.source.license}
                </Chip>
                <LinkChip
                  icon={<GithubLogoIcon aria-hidden />}
                  url={preset.source.url}>
                  {t("performance.configs.sources.github")}
                </LinkChip>
              </>
            )}
          </>
        }
        name={preset.name}
        tier={item.tier}
      />
    );
  }

  const { config: userConfig } = config;
  const { origin } = userConfig;
  return (
    <DetailsHeader
      blurb={null}
      chips={
        <>
          <Chip icon={<UserIcon aria-hidden />}>{originLabel(userConfig)}</Chip>
          <Chip icon={<CalendarBlankIcon aria-hidden />}>
            {t("performance.details.addedOn", {
              date: shortDate(userConfig.createdAt),
            })}
          </Chip>
          {userConfig.baseBuild !== null && (
            <Chip icon={<TagIcon aria-hidden />}>
              {t("performance.details.baseBuild", {
                build: userConfig.baseBuild,
              })}
            </Chip>
          )}
          {origin.kind === "gamebanana" && (
            <LinkChip
              icon={<GlobeIcon aria-hidden />}
              url={`https://gamebanana.com/mods/${origin.gamebananaId}`}>
              {t("performance.configs.sources.gamebanana")}
            </LinkChip>
          )}
        </>
      }
      name={userConfig.name}
      tier={item.tier}
    />
  );
};

const Credits = ({ config }: { config: ApplicableConfig }) => {
  const { t } = useTranslation();
  if (config.kind !== "preset") return null;
  const { preset } = config;
  return (
    <DetailsSection title={t("performance.details.credits.title")}>
      <p className='text-muted-foreground text-xs'>
        {preset.source.kind === "github" ? (
          <Trans
            components={{
              repo: (
                <ExternalLink
                  url={`https://github.com/${preset.source.repo}`}
                />
              ),
              commit: <ExternalLink url={preset.source.url} />,
            }}
            i18nKey='performance.details.credits.github'
            values={{
              author: preset.author,
              repo: preset.source.repo,
              license: preset.source.license,
              commit: preset.source.commit.slice(0, 7),
            }}
          />
        ) : (
          t("performance.details.credits.bundled", { author: preset.author })
        )}
      </p>
    </DetailsSection>
  );
};

const FooterNote = ({
  configId,
  desired,
  hasChanges,
}: {
  configId: string;
  desired: DesiredOverlay | null;
  hasChanges: boolean;
}) => {
  const { t } = useTranslation();
  const currentTweaks = usePersistedStore((state) =>
    desired ? (state.perfOverrides[desired.request.configId]?.length ?? 0) : 0,
  );
  if (!desired) return t("performance.details.footer.takesEffect");
  if (desired.request.configId === configId) {
    return hasChanges
      ? t("performance.details.footer.pendingChanges")
      : t("performance.details.footer.active");
  }
  return currentTweaks > 0
    ? t("performance.details.footer.replacesWithTweaks", {
        name: desired.request.name,
        count: currentTweaks,
      })
    : t("performance.details.footer.replaces", { name: desired.request.name });
};

const ApplicableDetails = ({
  item,
  config,
}: {
  item: PresetListItem | UserListItem;
  config: ApplicableConfig;
}) => {
  const { t } = useTranslation();
  const { catalogQuery, desired, activeResolved } = usePerfConfigList();
  const options = useStoredRequestOptions(item.configId);
  const resolvedQuery = usePerfResolve(applyRequestFor(config, options));

  const isActive = desired?.request.configId === item.configId;
  const hasChanges = isActive && !sameApplyOptions(desired.request, options);
  const current = desired && !isActive ? (activeResolved.data ?? null) : null;
  const videoSettings =
    config.kind === "preset"
      ? config.preset.videoSettings
      : config.config.videoSettings;

  return (
    <>
      <ApplicableHeader config={config} item={item} />
      <div className='flex-1 space-y-6 overflow-y-auto px-6 py-5'>
        {resolvedQuery.isPending && (
          <div className='space-y-2'>
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-32 w-full' />
          </div>
        )}
        {resolvedQuery.isError && (
          <p className='flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-muted-foreground text-sm'>
            <WarningIcon
              aria-hidden
              className='mt-0.5 size-4 shrink-0 text-amber-400'
            />
            {t("performance.details.resolveError", {
              message: getErrorMessage(resolvedQuery.error),
            })}
          </p>
        )}
        {resolvedQuery.data && (
          <>
            <WhatItChanges
              categories={catalogQuery.data?.categories ?? []}
              current={current}
              isCurrent={isActive}
              resolved={resolvedQuery.data}
            />
            <AuthorViewSettings
              configId={item.configId}
              entries={resolvedQuery.data.entries}
              overrides={options.overrides}
            />
            <NotApplied
              configId={item.configId}
              resolved={resolvedQuery.data}
            />
          </>
        )}
        <VideoSettingsChecklist
          notes={config.kind === "preset" ? config.preset.notes : []}
          settings={videoSettings}
        />
        <Credits config={config} />
      </div>
      <div className='flex items-center justify-between gap-3 border-t px-6 py-3'>
        <p className='text-muted-foreground text-xs'>
          <FooterNote
            configId={item.configId}
            desired={desired}
            hasChanges={hasChanges}
          />
        </p>
        <ApplyConfigButton
          config={config}
          entryPoint='details'
          size='default'
        />
      </div>
    </>
  );
};

const ConfigDetails = ({ configId }: { configId: string }) => {
  const { t } = useTranslation();
  const { catalogQuery, items } = usePerfConfigList();
  const item = items.find((candidate) => candidate.configId === configId);

  if (!item) {
    return (
      <div className='flex flex-col gap-3 p-6'>
        <SheetTitle>{t("performance.details.title")}</SheetTitle>
        {catalogQuery.isPending ? (
          <Skeleton className='h-40 w-full' />
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t("performance.details.notFound")}
          </p>
        )}
      </div>
    );
  }

  if (item.kind === "community") {
    return (
      <CommunityDetails
        item={item}
        latestBuild={catalogQuery.data?.latestBuild ?? null}
      />
    );
  }

  return (
    <ApplicableDetails
      config={
        item.kind === "preset"
          ? { kind: "preset", preset: item.preset }
          : { kind: "user", config: item.config }
      }
      item={item}
    />
  );
};

/** Right-hand sheet for a preset, GameBanana or user config. */
export const ConfigDetailsSheet = () => {
  const { detailsConfigId, openDetails } = usePerformanceUi();
  // Keep showing the last config while the sheet animates closed.
  const [shownConfigId, setShownConfigId] = useState(detailsConfigId);
  if (detailsConfigId !== null && detailsConfigId !== shownConfigId) {
    setShownConfigId(detailsConfigId);
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) openDetails(null);
      }}
      open={detailsConfigId !== null}>
      <SheetContent
        aria-describedby={undefined}
        className='flex w-full flex-col gap-0 p-0 sm:max-w-xl'
        side='right'>
        {shownConfigId && (
          <ConfigDetails configId={shownConfigId} key={shownConfigId} />
        )}
      </SheetContent>
    </Sheet>
  );
};
