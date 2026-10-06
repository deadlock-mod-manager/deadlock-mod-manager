import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { CheckCircleIcon, EyeIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import logger from "@/lib/logger";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";

export interface CrosshairCardProps {
  crosshair?: PublishedCrosshairDto;
  config?: CrosshairConfig;
  isActive?: boolean;
  onPreviewOpen?: () => void;
  onRemove?: () => void;
}

export const CrosshairCard = ({
  crosshair,
  config,
  isActive = false,
  onPreviewOpen,
  onRemove,
}: CrosshairCardProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setActiveCrosshair } = usePersistedStore();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );

  const applyCrosshairMutation = useMutation({
    mutationFn: async (crosshairConfig: CrosshairConfig) => {
      const attempt = analytics.start("crosshair_apply", {
        entry_point: "library",
      });
      try {
        if (!crosshairsEnabled) {
          attempt.finish("blocked");
          throw new Error("Custom crosshairs are disabled");
        }
        await invoke<void>("apply_crosshair_to_autoexec", {
          config: crosshairConfig,
        });
        attempt.finish("completed");
      } catch (error) {
        attempt.finish(
          failureOutcome(isTauriError(error) ? error.kind : undefined),
        );
        throw error;
      }
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

  const crosshairConfig = crosshair?.config ?? config;
  if (!crosshairConfig) {
    return null;
  }

  const handleApply = () => {
    applyCrosshairMutation.mutate(crosshairConfig);
  };

  const handlePreviewOpen = () => {
    onPreviewOpen?.();
  };

  const visibleHeroes =
    crosshair?.heroes?.filter((h) => h !== "Default").slice(0, 2) ?? [];
  const displayTags = crosshair?.tags?.slice(0, 2) ?? [];
  const remainingChips =
    (crosshair?.tags?.length ?? 0) +
    (crosshair?.heroes?.filter((h) => h !== "Default").length ?? 0) -
    visibleHeroes.length -
    displayTags.length;

  const isApplying = applyCrosshairMutation.isPending;
  const authorName = crosshair?.userName ?? t("crosshairs.unknownAuthor");

  return (
    <Card
      className={cn(
        "overflow-hidden bg-card",
        isActive && "border-primary/60",
      )}>
      <CardContent className='flex h-full flex-col p-0'>
        <button
          type='button'
          onClick={handlePreviewOpen}
          aria-label={t("crosshairs.previewNamed", {
            name: crosshair?.name ?? t("crosshairs.savedPreset"),
          })}
          className='relative flex w-full items-center justify-center bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'>
          <CrosshairCanvas
            config={crosshairConfig}
            interactive={false}
            height={crosshair ? 128 : 80}
          />
        </button>
        {crosshair && (
          <div className='flex flex-1 flex-col gap-1.5 px-3 pt-3'>
            <h3
              className='truncate text-sm font-semibold'
              title={crosshair.name}>
              {crosshair.name}
            </h3>
            <p
              className='truncate text-xs text-muted-foreground'
              title={authorName}>
              {t("mods.by")} {authorName}
            </p>
            <div className='flex min-h-6 flex-wrap items-center gap-1'>
              {visibleHeroes.map((hero) => (
                <Badge key={hero} variant='secondary' className='gap-1 text-xs'>
                  <HeroIcon className='h-4 w-4' hero={hero} />
                  {hero}
                </Badge>
              ))}
              {displayTags.map((tag) => (
                <Badge key={tag} variant='secondary' className='text-xs'>
                  {tag}
                </Badge>
              ))}
              {remainingChips > 0 && (
                <span className='text-xs text-muted-foreground'>
                  +{remainingChips}
                </span>
              )}
            </div>
          </div>
        )}
        <div className='flex items-center gap-1 p-2'>
          <Button
            variant='ghost'
            size='sm'
            className='flex-1 gap-1.5 px-2'
            icon={<EyeIcon aria-hidden weight='duotone' />}
            onClick={handlePreviewOpen}>
            {t("crosshairs.preview")}
          </Button>
          <Button
            variant={isActive ? "ghost" : "outline"}
            size='sm'
            className={cn("flex-1 gap-1.5 px-2", isActive && "text-primary")}
            icon={
              <CheckCircleIcon
                aria-hidden
                weight={isActive ? "fill" : "duotone"}
              />
            }
            disabled={isApplying || isActive || !crosshairsEnabled}
            isLoading={isApplying}
            onClick={handleApply}>
            {isActive ? t("crosshairs.selected") : t("crosshairs.form.apply")}
          </Button>
          {onRemove && (
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 shrink-0'
              aria-label={t("crosshairs.removeFromHistory")}
              onClick={onRemove}>
              <TrashIcon className='h-4 w-4' />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
