import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { Button } from "@deadlock-mods/ui/components/button";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  CrosshairIcon,
  EyeIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCard } from "./crosshair-card";
import { CrosshairPreviewDialog } from "./crosshair-preview-dialog";

export const ActiveCrosshairs = () => {
  const { t } = useTranslation();
  const activeCrosshairHistory = usePersistedStore(
    (state) => state.activeCrosshairHistory,
  );
  const {
    setActiveCrosshair,
    removeFromActiveCrosshairHistory,
    clearActiveCrosshair,
  } = usePersistedStore();
  const activeCrosshair = usePersistedStore((state) => state.activeCrosshair);
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );
  const [previewConfig, setPreviewConfig] = useState<CrosshairConfig | null>(
    null,
  );
  const queryClient = useQueryClient();

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: CrosshairConfig) => {
      if (!crosshairsEnabled) {
        throw new Error("Custom crosshairs are disabled");
      }
      return invoke("apply_crosshair_to_autoexec", { config: crosshairConfig });
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (_, crosshairConfig) => {
      setActiveCrosshair(crosshairConfig);
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      if (isTauriError(error) && error.kind === "gameRunning") {
        toast.error(t("crosshairs.stopGameBeforeChange"));
        return;
      }
      if (
        error instanceof Error &&
        error.message === "Custom crosshairs are disabled"
      ) {
        toast.error(t("crosshairs.disabledError"));
      } else {
        toast.error(t("crosshairs.form.applyError"));
      }
    },
  });

  const removeCrosshairMutation = useMutation({
    mutationFn: (_config: CrosshairConfig) => {
      return invoke("remove_crosshair_from_autoexec");
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (_, config) => {
      removeFromActiveCrosshairHistory(config);
      clearActiveCrosshair();
      toast.success(t("crosshairs.removedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      if (isTauriError(error) && error.kind === "gameRunning") {
        toast.error(t("crosshairs.stopGameBeforeChange"));
        return;
      }
      toast.error(t("crosshairs.form.applyError"));
    },
  });

  const handleApply = () => {
    if (!previewConfig) return;
    applyCrosshairMutation.mutate(previewConfig);
  };

  const handleRemove = (config: CrosshairConfig, isActive: boolean) => {
    if (isActive) {
      removeCrosshairMutation.mutate(config);
    } else {
      removeFromActiveCrosshairHistory(config);
      toast.success(t("crosshairs.removedFromHistory"));
    }
  };

  return (
    <section
      className='mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'
      aria-label={t("crosshairs.currentCrosshair")}>
      <div className='flex flex-col overflow-hidden rounded-lg border border-border bg-card sm:flex-row'>
        <div className='flex items-center justify-center bg-muted/20 sm:w-40 sm:shrink-0'>
          {activeCrosshair ? (
            <CrosshairCanvas
              config={activeCrosshair}
              interactive={false}
              height={172}
              background='bg1'
            />
          ) : (
            <CrosshairIcon className='m-12 h-12 w-12 text-muted-foreground' />
          )}
        </div>
        <div className='flex flex-1 flex-col items-start justify-center gap-2 p-5'>
          <h2 className='text-base font-semibold'>
            {t("crosshairs.currentCrosshair")}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t(
              !crosshairsEnabled
                ? "crosshairs.pausedDescription"
                : activeCrosshair
                  ? "crosshairs.currentDescription"
                  : "crosshairs.noActiveCrosshair",
            )}
          </p>
          {activeCrosshair && (
            <div className='mt-1 flex flex-wrap gap-2'>
              <Button
                variant='outline'
                size='sm'
                icon={<EyeIcon aria-hidden weight='duotone' />}
                onClick={() => setPreviewConfig(activeCrosshair)}>
                {t("crosshairs.preview")}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                icon={<ArrowCounterClockwiseIcon aria-hidden />}
                disabled={removeCrosshairMutation.isPending}
                isLoading={removeCrosshairMutation.isPending}
                onClick={() => handleRemove(activeCrosshair, true)}>
                {t("crosshairs.restorePrevious")}
              </Button>
            </div>
          )}
        </div>
      </div>
      {activeCrosshairHistory.length > 0 && (
        <div className='min-w-0'>
          <h2 className='mb-3 text-sm font-semibold'>
            {t("crosshairs.recentlyUsed")}
          </h2>
          <div className='flex gap-3 overflow-x-auto pb-2'>
            {activeCrosshairHistory.map((config: CrosshairConfig) => {
              const isActive =
                JSON.stringify(activeCrosshair) === JSON.stringify(config);
              return (
                <div key={JSON.stringify(config)} className='w-60 shrink-0'>
                  <CrosshairCard
                    config={config}
                    isActive={isActive}
                    onPreviewOpen={() => setPreviewConfig(config)}
                    onRemove={() => handleRemove(config, isActive)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {previewConfig && (
        <CrosshairPreviewDialog
          open={!!previewConfig}
          onOpenChange={(open) => {
            if (!open) setPreviewConfig(null);
          }}
          config={previewConfig}
          onApply={handleApply}
          isApplying={applyCrosshairMutation.isPending}
        />
      )}
    </section>
  );
};
