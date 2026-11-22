import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  MonitorIcon,
  PushPinIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { useResolveVideoChanges } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import { videoLabel, videoValueText } from "@/lib/performance/video";
import type {
  PerfConfigHistoryEntry,
  PerfHistoryEntry,
} from "@/lib/store/slices/performance";

type VideoEntry = Exclude<PerfHistoryEntry, PerfConfigHistoryEntry>;

const ICONS = {
  videoChanged: MonitorIcon,
  videoReverted: ArrowCounterClockwiseIcon,
  videoKept: CheckIcon,
  videoRestored: ArrowCounterClockwiseIcon,
  videoAdopted: PushPinIcon,
} satisfies Record<VideoEntry["action"], typeof MonitorIcon>;

/**
 * A History row for something that happened to video.txt alone. Changes made
 * in game can still be kept or undone while the file holds them.
 */
export const HistoryVideoRow = ({ entry }: { entry: VideoEntry }) => {
  const { t } = useTranslation();
  const { data: status } = usePerfStatus();
  const resolve = useResolveVideoChanges();
  const Icon = ICONS[entry.action];

  // The entry's changes the file still holds and the player hasn't settled.
  const open =
    entry.action === "videoChanged"
      ? entry.changes.filter((change) =>
          status?.video.changed.some(
            (live) =>
              !live.kept &&
              live.key.toLowerCase() === change.key.toLowerCase() &&
              live.current === change.current,
          ),
        )
      : [];
  const keys = open.map((change) => change.key);

  return (
    <li className='flex flex-wrap items-center gap-3 px-4 py-2.5'>
      <Icon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm'>
          {entry.action === "videoChanged"
            ? t("performance.history.videoChanged", {
                count: entry.changes.length,
              })
            : t(`performance.history.${entry.action}`)}
        </p>
        <p className='flex gap-x-3 text-muted-foreground text-xs'>
          <DateDisplay date={new Date(entry.at)} />
          <span className='min-w-0 truncate'>
            {entry.action === "videoChanged"
              ? entry.changes
                  .map((change) =>
                    t("performance.history.videoChange", {
                      setting: change.label ?? change.key,
                      config: videoValueText(change.key, change.written),
                      yours:
                        change.current === null
                          ? t("performance.video.changes.removed")
                          : videoValueText(change.key, change.current),
                    }),
                  )
                  .join(", ")
              : "keys" in entry
                ? entry.keys.map((key) => videoLabel(key) ?? key).join(", ")
                : null}
          </span>
        </p>
      </div>
      {keys.length > 0 && (
        <div className='flex gap-2'>
          <Button
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ choice: "keep", keys })}
            size='sm'
            variant='ghost'>
            {t("performance.video.changes.keep")}
          </Button>
          <Button
            disabled={resolve.isPending}
            isLoading={resolve.isPending}
            onClick={() => resolve.mutate({ choice: "useConfig", keys })}
            size='sm'
            variant='outline'>
            {t("performance.video.changes.useConfig", { count: keys.length })}
          </Button>
        </div>
      )}
    </li>
  );
};
