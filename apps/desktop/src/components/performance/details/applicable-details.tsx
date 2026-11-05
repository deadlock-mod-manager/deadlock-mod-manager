import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
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
import { ApplyConfigButton } from "../configs/apply-config-button";
import { ApplicableHeader } from "./applicable-header";
import { AuthorViewSettings } from "./author-view-settings";
import { Credits } from "./credits";
import { FooterNote } from "./footer-note";
import { NotApplied } from "./not-applied";
import { VideoSettings } from "./video-settings";
import { WhatItChanges } from "./what-it-changes";

export const ApplicableDetails = ({
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
        <VideoSettings
          configId={item.configId}
          notes={config.kind === "preset" ? config.preset.notes : []}
          settings={videoSettings}
          variants={
            config.kind === "preset" ? config.preset.videoVariants : undefined
          }
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
