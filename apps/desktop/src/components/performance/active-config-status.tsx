import { Alert } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  FileTextIcon,
  FolderOpenIcon,
  GaugeIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCatalogBehind } from "@/hooks/performance/use-catalog-behind";
import { useNavigate } from "react-router";
import { usePerfConfigList } from "@/hooks/performance/use-perf-config-list";
import {
  useApplyPerfConfig,
  useRemovePerfConfig,
} from "@/hooks/performance/use-perf-mutations";
import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { getErrorMessage } from "@/lib/errors";
import { isGameRunningError } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { reapplyPerfConfig } from "@/lib/performance/api";
import { applySourceFor } from "@/lib/performance/config-list";
import { undoTarget } from "@/lib/performance/history";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { presetIdFromConfigId } from "@/lib/performance/request";
import { tierForScore, tierInfo } from "@/lib/performance/scale";
import { usePersistedStore } from "@/lib/store";
import { openGameInfoEditor } from "@/lib/tauri-commands";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { ForeignOverlay } from "@/types/generated/ForeignOverlay";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { PerfTier } from "@/types/generated/PerfTier";
import { isTauriError } from "@/types/tauri";
import { Chip } from "./configs/card-parts";
import { usePerformanceUi } from "./performance-context";

const Notice = ({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) => (
  <Alert className='py-2' variant='warning'>
    <WarningIcon className='size-4 shrink-0' />
    <p className='min-w-0 flex-1'>{children}</p>
    {action}
  </Alert>
);

const useReapplyPerfConfig = ({ request }: DesiredOverlay) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);

  return useMutation<PerfStatus, Error>({
    mutationFn: async () => {
      const attempt = analytics.start("performance_config_apply", {
        source: applySourceFor(request.configId, userConfigs),
        preset_id: presetIdFromConfigId(request.configId) ?? undefined,
        entry_point: "reapply",
        include_engine_sections: request.includeEngineSections,
      });
      try {
        const status = await reapplyPerfConfig();
        attempt.finish("completed", {
          applied_count: status.desired?.counts.applies,
        });
        return status;
      } catch (error) {
        attempt.finish(
          failureOutcome(isTauriError(error) ? error.kind : undefined),
        );
        throw error;
      }
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status) => {
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      toast.success(t("performance.activeStatus.reapplied"));
    },
    onError: (error) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Re-applying performance config failed");
      toast.error(t("performance.activeStatus.reapplyFailed"), {
        description: getErrorMessage(error),
      });
    },
  });
};

const UndoButton = ({
  currentConfigId,
}: {
  currentConfigId: string | null;
}) => {
  const { t } = useTranslation();
  const history = usePersistedStore((state) => state.perfHistory);
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();
  const removeMutation = useRemovePerfConfig();
  const target = undoTarget(history, currentConfigId, userConfigs);
  if (!target) return null;

  const undo = () => {
    if (target.kind === "remove") {
      removeMutation.mutate({ entryPoint: "undo" });
      return;
    }
    applyMutation.mutate({
      request: target.request,
      source: applySourceFor(target.request.configId, userConfigs),
      entryPoint: "undo",
    });
  };

  return (
    <Button
      icon={<ArrowCounterClockwiseIcon aria-hidden />}
      isLoading={applyMutation.isPending || removeMutation.isPending}
      onClick={undo}
      size='sm'
      variant='ghost'>
      {t("performance.activeStatus.undo")}
    </Button>
  );
};

const OpenInEditorButton = () => {
  const { t } = useTranslation();
  const openMutation = useMutation({
    mutationFn: openGameInfoEditor,
    meta: { skipGlobalErrorHandler: true },
    onError: (error) => {
      logger.withError(error).error("Opening gameinfo.gi failed");
      toast.error(t("performance.activeStatus.openInEditorFailed"), {
        description: getErrorMessage(error),
      });
    },
  });

  return (
    <Button
      icon={<FileTextIcon aria-hidden />}
      isLoading={openMutation.isPending}
      onClick={() => openMutation.mutate()}
      size='sm'
      variant='ghost'>
      {t("performance.activeStatus.openInEditor")}
    </Button>
  );
};

const ForeignOverlayNotices = ({
  foreign,
  desired,
}: {
  foreign: ForeignOverlay[];
  desired: DesiredOverlay;
}) => {
  const { t } = useTranslation();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();

  const replace = () =>
    applyMutation.mutate(
      {
        request: desired.request,
        removeForeign: true,
        source: applySourceFor(desired.request.configId, userConfigs),
        entryPoint: "reapply",
        notify: false,
      },
      {
        onSuccess: (result) => {
          if (result.removedForeign.length === 0) return;
          toast.success(
            t("performance.activeStatus.foreignReplaced", {
              count: result.removedForeign.length,
            }),
          );
        },
      },
    );

  return foreign.map((overlay) => (
    <Notice
      action={
        <Button
          isLoading={applyMutation.isPending}
          onClick={replace}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.replaceForeign")}
        </Button>
      }
      key={`${overlay.tool}-${overlay.label ?? ""}`}>
      {overlay.label
        ? t("performance.activeStatus.foreignAlsoLabelled", {
            tool: t(`performance.foreignTools.${overlay.tool}`),
            label: overlay.label,
          })
        : t("performance.activeStatus.foreignAlso", {
            tool: t(`performance.foreignTools.${overlay.tool}`),
          })}
    </Notice>
  ));
};

const SyncNotice = ({
  status,
  desired,
}: {
  status: PerfStatus;
  desired: DesiredOverlay;
}) => {
  const { t } = useTranslation();
  const reapplyMutation = useReapplyPerfConfig(desired);
  const handEdited = status.applied?.handEdited ?? [];
  if (status.inSync && handEdited.length === 0) return null;

  const reapplyButton = (
    <Button
      icon={<ArrowsClockwiseIcon aria-hidden />}
      isLoading={reapplyMutation.isPending}
      onClick={() => reapplyMutation.mutate()}
      size='sm'
      variant='outline'>
      {t("performance.activeStatus.reapply")}
    </Button>
  );

  if (handEdited.length > 0) {
    return (
      <Notice action={reapplyButton}>
        {t("performance.activeStatus.handEdited", {
          count: handEdited.length,
          keys: handEdited
            .slice(0, 3)
            .map((path) => path[path.length - 1])
            .join(", "),
        })}
      </Notice>
    );
  }

  return (
    <Notice action={reapplyButton}>
      {status.applied === null
        ? t("performance.activeStatus.notInFile")
        : t("performance.activeStatus.outOfDate")}
    </Notice>
  );
};

const ActiveStrip = ({
  status,
  desired,
  name,
  tier,
}: {
  status: PerfStatus;
  desired: DesiredOverlay;
  name: string;
  tier: PerfTier | null;
}) => {
  const { t } = useTranslation();
  const { openEditor } = usePerformanceUi();
  const tweakCount = usePersistedStore(
    (state) => state.perfOverrides[desired.request.configId]?.length ?? 0,
  );
  const summary = status.inSync
    ? t("performance.activeStatus.inFile", { count: desired.counts.applies })
    : t("performance.activeStatus.settings", { count: desired.counts.applies });

  return (
    <section
      aria-label={t("performance.activeStatus.label")}
      className='flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-3 pl-4'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-muted'>
        <GaugeIcon
          aria-hidden
          className='size-5 text-primary'
          weight='duotone'
        />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='truncate font-semibold'>{name}</h2>
          {tier && (
            <span className='text-muted-foreground text-sm'>
              <span aria-hidden>{tierInfo(tier).emoji}</span>{" "}
              {t(`performance.tiers.${tier}.label`)}
            </span>
          )}
          {status.inSync ? (
            <Chip icon={<CheckCircleIcon aria-hidden />} tone='success'>
              {t("performance.activeStatus.active")}
            </Chip>
          ) : (
            <Chip icon={<WarningIcon aria-hidden />} tone='warning'>
              {t("performance.activeStatus.notWritten")}
            </Chip>
          )}
          {tweakCount > 0 && (
            <Chip icon={<SlidersHorizontalIcon aria-hidden />}>
              {t("performance.activeStatus.tweaks", { count: tweakCount })}
            </Chip>
          )}
        </div>
        <p className='mt-0.5 text-muted-foreground text-xs'>
          {summary}. {t("performance.activeStatus.takesEffect")}
        </p>
      </div>
      <div className='flex items-center gap-1.5'>
        <Button
          icon={<SlidersHorizontalIcon aria-hidden />}
          onClick={() => openEditor(desired.request.configId)}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.editSettings")}
        </Button>
        <OpenInEditorButton />
        <UndoButton currentConfigId={desired.request.configId} />
      </div>
    </section>
  );
};

const EmptyStrip = ({ foreign }: { foreign: ForeignOverlay[] }) => {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("performance.activeStatus.label")}
      className='flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 pl-4'>
      <GaugeIcon
        aria-hidden
        className='size-5 shrink-0 text-muted-foreground'
      />
      <div className='min-w-0 flex-1 text-sm'>
        <p>{t("performance.activeStatus.none")}</p>
        {foreign.map((overlay) => (
          <p
            className='text-muted-foreground text-xs'
            key={`${overlay.tool}-${overlay.label ?? ""}`}>
            {t("performance.activeStatus.foreignOnly", {
              tool: t(`performance.foreignTools.${overlay.tool}`),
            })}
          </p>
        ))}
      </div>
      <OpenInEditorButton />
      <UndoButton currentConfigId={null} />
    </section>
  );
};

const GameMissingStrip = ({ reason }: { reason: "path" | "gameinfo" }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className='flex flex-wrap items-center gap-3 rounded-lg border p-3 pl-4'>
      <FolderOpenIcon
        aria-hidden
        className='size-5 shrink-0 text-muted-foreground'
      />
      <p className='min-w-0 flex-1 text-sm'>
        {reason === "path"
          ? t("performance.activeStatus.noGamePath")
          : t("performance.activeStatus.noGameinfo")}
      </p>
      <Button
        onClick={() => navigate("/settings", { state: { activeTab: "game" } })}
        size='sm'
        variant='outline'>
        {t("performance.activeStatus.openSettings")}
      </Button>
    </section>
  );
};

/** Our lines are in gameinfo.gi but no config is chosen, e.g. after restoring a backup. */
const OrphanedOverlayNotice = ({ name }: { name: string }) => {
  const { t } = useTranslation();
  const removeMutation = useRemovePerfConfig();
  return (
    <Notice
      action={
        <Button
          isLoading={removeMutation.isPending}
          onClick={() => removeMutation.mutate({ entryPoint: "page" })}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.removeOrphaned")}
        </Button>
      }>
      {t("performance.activeStatus.orphaned", { name })}
    </Notice>
  );
};

/** The game updated past the catalog's convar list; it catches up with the next catalog update. */
export const CatalogBehindNotice = () => {
  const { t } = useTranslation();
  const behind = useCatalogBehind();
  if (!behind) return null;
  return (
    <p className='mt-2 flex items-start gap-1.5 px-1 text-muted-foreground text-xs'>
      <InfoIcon aria-hidden className='mt-0.5 size-3.5 shrink-0' />
      {t("performance.activeStatus.catalogBehind", behind)}
    </p>
  );
};

/** What the file holds versus what the user chose, with the fixes for any gap. */
export const ActiveConfigStatus = () => {
  const { t } = useTranslation();
  const { statusQuery, desired, items, activeItem, activeCutScore } =
    usePerfConfigList();

  if (statusQuery.isPending) {
    return <Skeleton className='h-16 w-full rounded-lg' />;
  }

  if (statusQuery.isError) {
    return (
      <Notice
        action={
          <Button
            isLoading={statusQuery.isRefetching}
            onClick={() => statusQuery.refetch()}
            size='sm'
            variant='outline'>
            {t("performance.configs.retry")}
          </Button>
        }>
        {t("performance.activeStatus.error", {
          message: getErrorMessage(statusQuery.error),
        })}
      </Notice>
    );
  }

  const status = statusQuery.data;
  if (!status.gamePathSet) return <GameMissingStrip reason='path' />;
  if (!status.gameinfoFound) return <GameMissingStrip reason='gameinfo' />;
  if (!desired && status.applied) {
    const { configId } = status.applied;
    return (
      <OrphanedOverlayNotice
        name={
          items.find((item) => item.configId === configId)?.name ?? configId
        }
      />
    );
  }
  if (!desired) return <EmptyStrip foreign={status.foreign} />;

  const tier =
    activeItem?.tier ??
    (activeCutScore === null ? null : tierForScore(activeCutScore).id);

  return (
    <div className='flex flex-col gap-3'>
      <ActiveStrip
        desired={desired}
        name={activeItem?.name ?? desired.request.name}
        status={status}
        tier={tier}
      />
      <SyncNotice desired={desired} status={status} />
      <ForeignOverlayNotices desired={desired} foreign={status.foreign} />
    </div>
  );
};
