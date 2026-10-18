import { Button } from "@deadlock-mods/ui/components/button";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Loader2, Wrench } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFixMods,
  useGameRunning,
  useIsCheckingModHealth,
  useModHealthProgress,
  useModHealthReport,
} from "@/hooks/use-mod-health";
import {
  fixableModIds,
  gameUpdatedSinceLastCheck,
  isFixableStatus,
} from "@/lib/mods/mod-health";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { ModHealthDialog } from "./mod-health-dialog";

export const ModHealthBanner = ({
  profileFolder,
}: {
  profileFolder: string | null;
}) => {
  const { t } = useTranslation();
  const localMods = usePersistedStore((state) => state.localMods);
  const report = useModHealthReport(profileFolder);
  const isChecking = useIsCheckingModHealth();
  const progress = useModHealthProgress((state) => state.progress);
  const gameRunning = useGameRunning();
  const fix = useFixMods();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const installedIds = new Set(
    localMods
      .filter((mod) => mod.status === ModStatus.Installed)
      .map((mod) => mod.remoteId),
  );
  const fixableIds = fixableModIds(report.data, (modId) =>
    installedIds.has(modId),
  );
  const fixable =
    report.data?.mods.filter(
      (health) =>
        isFixableStatus(health.status) && installedIds.has(health.modId),
    ) ?? [];
  const count = fixable.length;
  const crashRiskCount = count - fixableIds.length;
  // Partly fixable mods still need an author update after fixing, so the
  // message says the fix may only be partial.
  const somePartly = fixable.some(
    (health) => health.status === "partlyFixable",
  );
  const messageKey = gameUpdatedSinceLastCheck(report.data)
    ? "gameUpdated"
    : "olderVersion";
  const checking =
    isChecking && progress && progress.total > 0 ? progress : null;
  if (count === 0 && !checking) {
    return (
      <ModHealthDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        profileFolder={profileFolder}
      />
    );
  }
  const checkedLabel = checking
    ? t("modHealth.banner.checkingCount", {
        checked: checking.checked,
        total: checking.total,
      })
    : null;

  return (
    <>
      <div
        className='shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card/45 shadow-sm'
        data-testid='mod-health-banner'>
        <div className='flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex min-w-0 items-start gap-2.5'>
            <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80 text-primary ring-1 ring-border/80'>
              {count > 0 ? (
                <Wrench aria-hidden className='h-4 w-4' />
              ) : (
                <Loader2 aria-hidden className='h-4 w-4 animate-spin' />
              )}
            </div>
            <div
              className='flex min-w-0 flex-1 flex-col gap-0.5'
              role={count > 0 ? undefined : "status"}>
              <p className='text-pretty font-medium text-[13px] text-foreground leading-5'>
                {count > 0
                  ? t(
                      `modHealth.banner.${messageKey}${somePartly ? "Partly" : ""}`,
                      { count },
                    )
                  : t("modHealth.banner.checkingTitle")}
              </p>
              {count === 0 ? (
                <p className='text-muted-foreground text-xs leading-5'>
                  {t("modHealth.banner.checkingDescription")}
                </p>
              ) : null}
              {count > 0 && gameRunning ? (
                <p className='text-muted-foreground text-xs leading-5'>
                  {t("modHealth.closeGame")}
                </p>
              ) : null}
              {crashRiskCount > 0 ? (
                <p className='text-muted-foreground text-xs leading-5'>
                  {t("modHealth.banner.crashRisk", { count: crashRiskCount })}
                </p>
              ) : null}
            </div>
          </div>
          {count > 0 ? (
            <div className='flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0'>
              {checkedLabel ? (
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {checkedLabel}
                </span>
              ) : null}
              {fixableIds.length > 0 ? (
                <Button
                  size='sm'
                  disabled={gameRunning}
                  isLoading={fix.isPending}
                  icon={<Wrench className='h-4 w-4' />}
                  onClick={() =>
                    fix.mutate({ profileFolder, modIds: fixableIds })
                  }>
                  {t("modHealth.banner.fix", { count: fixableIds.length })}
                </Button>
              ) : null}
              <Button
                size='sm'
                variant='outline'
                onClick={() => setDetailsOpen(true)}>
                {t("modHealth.banner.seeDetails")}
              </Button>
            </div>
          ) : (
            <span className='shrink-0 pl-9 text-muted-foreground text-xs tabular-nums sm:pl-0'>
              {checkedLabel}
            </span>
          )}
        </div>
        {checking ? (
          <Progress
            aria-label={checkedLabel ?? undefined}
            className='h-0.5 bg-primary/10'
            value={(checking.checked / checking.total) * 100}
          />
        ) : null}
      </div>
      <ModHealthDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        profileFolder={profileFolder}
      />
    </>
  );
};
