import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  PowerIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { useApplyPerfConfig } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import { applySourceFor } from "@/lib/performance/config-list";
import { historyApplyRequest } from "@/lib/performance/history";
import { usePersistedStore } from "@/lib/store";
import type { PerfHistoryEntry } from "@/lib/store/slices/performance";

const HistoryRow = ({
  entry,
  isCurrent,
}: {
  entry: PerfHistoryEntry;
  isCurrent: boolean;
}) => {
  const { t } = useTranslation();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();
  const request =
    entry.request && historyApplyRequest(entry.request, userConfigs);
  const configDeleted = entry.request !== null && request === null;

  return (
    <li className='flex items-center gap-3 px-4 py-2.5'>
      {entry.action === "applied" ? (
        <CheckCircleIcon
          aria-hidden
          className='size-4 shrink-0 text-primary'
          weight='duotone'
        />
      ) : (
        <PowerIcon
          aria-hidden
          className='size-4 shrink-0 text-muted-foreground'
        />
      )}
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm'>
          {entry.action === "applied"
            ? t("performance.history.applied", { name: entry.name })
            : t("performance.history.removed")}
        </p>
        <p className='flex flex-wrap gap-x-3 text-muted-foreground text-xs'>
          <DateDisplay date={new Date(entry.at)} />
          {entry.appliedCount !== null && (
            <span>
              {t("performance.configs.settingsCount", {
                count: entry.appliedCount,
              })}
            </span>
          )}
          {configDeleted && !isCurrent && (
            <span>{t("performance.history.configDeleted")}</span>
          )}
        </p>
      </div>
      {isCurrent && (
        <Badge className='text-[11px]' variant='secondary'>
          {t("performance.history.current")}
        </Badge>
      )}
      {entry.request && !isCurrent && (
        <Button
          disabled={request === null}
          icon={<ArrowCounterClockwiseIcon aria-hidden />}
          isLoading={applyMutation.isPending}
          onClick={() => {
            if (!request) return;
            applyMutation.mutate({
              request,
              source: applySourceFor(request.configId, userConfigs),
              entryPoint: "history",
            });
          }}
          size='sm'
          variant='outline'>
          {t("performance.history.applyAgain")}
        </Button>
      )}
    </li>
  );
};

export const HistoryTab = () => {
  const { t } = useTranslation();
  const history = usePersistedStore((state) => state.perfHistory);
  const { data: status } = usePerfStatus();
  const currentConfigId = status?.desired?.request.configId ?? null;

  if (history.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ClockCounterClockwiseIcon />
          </EmptyMedia>
          <EmptyTitle>{t("performance.history.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("performance.history.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section aria-label={t("performance.tabs.history")}>
      <p className='mb-3 text-muted-foreground text-xs'>
        {t("performance.history.description")}
      </p>
      <ul className='divide-y rounded-lg border bg-card'>
        {history.map((entry, index) => (
          <HistoryRow
            entry={entry}
            isCurrent={
              index === 0 &&
              entry.action === "applied" &&
              entry.configId === currentConfigId
            }
            key={entry.id}
          />
        ))}
      </ul>
    </section>
  );
};
