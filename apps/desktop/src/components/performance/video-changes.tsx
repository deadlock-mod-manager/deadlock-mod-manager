import { Button } from "@deadlock-mods/ui/components/button";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResolveVideoChanges } from "@/hooks/performance/use-perf-mutations";
import { videoLabel, videoValueText } from "@/lib/performance/video";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { VideoChange } from "@/types/generated/VideoChange";
import { DetailsSection } from "./details/details-parts";

const SETTLED_MS = 4000;

/**
 * Settings the player changed in game since the config wrote them, each with
 * the config's value and theirs: keep theirs, or put the config's back.
 */
export const VideoChanges = ({ changes }: { changes: VideoChange[] }) => {
  const { t } = useTranslation();
  const resolve = useResolveVideoChanges();
  // Settling the last change says so for a moment instead of just vanishing.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setSettled(false), SETTLED_MS);
    return () => clearTimeout(timer);
  }, [settled]);
  const onResolved = (status: PerfStatus) =>
    setSettled(status.video.changed.length === 0);

  if (changes.length === 0) {
    if (!settled) return null;
    return (
      <p
        className='flex animate-in items-center gap-2 text-muted-foreground text-sm duration-300 fade-in'
        role='status'>
        <svg
          aria-hidden
          className='perf-draw size-4 text-primary'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='24'
          viewBox='0 0 256 256'>
          <polyline pathLength='1' points='40,144 96,200 224,72' />
        </svg>
        {t("performance.video.changes.settled")}
      </p>
    );
  }

  const pending = changes.filter((change) => !change.kept);
  const busyKeys = resolve.isPending ? (resolve.variables?.keys ?? []) : [];
  const isBusy = (keys: string[]) =>
    busyKeys.length === keys.length &&
    keys.every((key) => busyKeys.includes(key));

  return (
    <DetailsSection
      action={
        pending.length > 1 && (
          <Button
            disabled={resolve.isPending}
            isLoading={isBusy(pending.map((change) => change.key))}
            onClick={() =>
              resolve.mutate(
                {
                  choice: "useConfig",
                  keys: pending.map((change) => change.key),
                },
                { onSuccess: onResolved },
              )
            }
            size='sm'
            variant='outline'>
            {t("performance.video.changes.useAll")}
          </Button>
        )
      }
      description={t("performance.video.changes.description")}
      title={t("performance.video.changes.title")}>
      <ul className='divide-y rounded-md border bg-card'>
        {changes.map((change) => {
          const config = videoValueText(change.key, change.written);
          const yours =
            change.current === null
              ? t("performance.video.changes.removed")
              : videoValueText(change.key, change.current);
          return (
            <li
              className='flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2'
              data-video-key={change.key}
              key={change.key}>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm' title={change.key}>
                  {videoLabel(change.key) ?? change.key}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {change.kept
                    ? t("performance.video.changes.kept", { yours })
                    : t("performance.video.changes.values", { config, yours })}
                </p>
              </div>
              {!change.kept && (
                <Button
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate(
                      { choice: "keep", keys: [change.key] },
                      { onSuccess: onResolved },
                    )
                  }
                  size='sm'
                  variant='ghost'>
                  {t("performance.video.changes.keep")}
                </Button>
              )}
              <Button
                disabled={resolve.isPending}
                isLoading={
                  resolve.variables?.choice === "useConfig" &&
                  isBusy([change.key])
                }
                onClick={() =>
                  resolve.mutate(
                    { choice: "useConfig", keys: [change.key] },
                    { onSuccess: onResolved },
                  )
                }
                size='sm'
                variant='outline'>
                {t("performance.video.changes.use", { value: config })}
              </Button>
            </li>
          );
        })}
      </ul>
    </DetailsSection>
  );
};
