import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { useRemoteInstallSummary } from "@/hooks/use-remote-install";
import { GameBananaIcon } from "@/components/shared/gamebanana-logo";
import { useOneClickInstalls } from "@/lib/one-click-installs";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { RemoteInstallItem } from "@/components/layout/bottom-bar/remote-install-item";

const MAX_LISTED_REMOTE_INSTALLS = 5;

export function RemoteInstallIndicator() {
  const { t } = useTranslation();
  const { queue, state, lastCheckedLabel } = useRemoteInstallSummary();
  const activeSlugs = useOneClickInstalls(
    useShallow((state) =>
      Object.keys(state.active).filter(
        (slug) => state.active[slug] === "remote_install",
      ),
    ),
  );
  const activeCount = activeSlugs.length;

  if (state === "unpaired") {
    return null;
  }

  const failed = state === "failed";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={t("remoteInstall.checkNow")}
          aria-disabled={queue.isFetching}
          className='flex cursor-pointer items-center gap-1 p-0.5 aria-disabled:cursor-default'
          onClick={(event) => {
            // Radix closes the tooltip on click and a disabled button never
            // reports the pointer leaving, which left it closed for good.
            // Keep it open so the check's progress stays visible.
            event.preventDefault();
            if (!queue.isFetching) void queue.refetch();
          }}
          type='button'>
          <GameBananaIcon
            className={cn(
              queue.isFetching && "animate-pulse",
              failed
                ? "text-red-500"
                : activeCount > 0
                  ? "text-blue-500"
                  : queue.dataUpdatedAt
                    ? "text-status-ok"
                    : "text-muted-foreground",
            )}
          />
          {activeCount > 0 && (
            <span className='tabular-nums text-foreground'>{activeCount}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className='w-64 space-y-1 p-2' side='top' sideOffset={8}>
        <p className='text-xs font-medium'>
          {t(
            failed
              ? "remoteInstall.indicatorError"
              : "remoteInstall.indicatorLinked",
          )}
        </p>
        {activeCount > 0 && (
          <>
            <p className='text-xs'>
              {t("remoteInstall.indicatorActive", { count: activeCount })}
            </p>
            <ul className='space-y-1 py-1'>
              {activeSlugs.slice(0, MAX_LISTED_REMOTE_INSTALLS).map((slug) => (
                <RemoteInstallItem key={slug} slug={slug} />
              ))}
            </ul>
            {activeCount > MAX_LISTED_REMOTE_INSTALLS && (
              <p className='text-muted-foreground text-xs'>
                {t("remoteInstall.indicatorMore", {
                  count: activeCount - MAX_LISTED_REMOTE_INSTALLS,
                })}
              </p>
            )}
          </>
        )}
        <p className='text-xs text-muted-foreground'>{lastCheckedLabel}</p>
        {!queue.isFetching && (
          <p className='text-xs text-muted-foreground'>
            {t("remoteInstall.indicatorClickToCheck")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
