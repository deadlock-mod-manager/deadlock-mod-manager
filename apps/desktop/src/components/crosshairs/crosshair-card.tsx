import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { EyeIcon, PencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useHover } from "@uidotdev/usehooks";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
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
  const [ref, hovering] = useHover();
  const queryClient = useQueryClient();
  const { setActiveCrosshair } = usePersistedStore();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );

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
      logger.error(error);
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

  const displayTags = crosshair?.tags?.slice(0, 3) ?? [];
  const remainingTags = crosshair?.tags?.length ? crosshair.tags.length - 3 : 0;

  const handlePreviewOpen = () => {
    onPreviewOpen?.();
  };

  return (
    <Card
      className={`border cursor-pointer ${isActive ? "border-2 border-primary" : ""}`}
      onClick={handlePreviewOpen}>
      <CardContent className='relative flex flex-col gap-3 p-0'>
        {isActive && (
          <Badge variant='default' className='absolute top-2 right-2 z-10'>
            {t("crosshairs.currentlyActive")}
          </Badge>
        )}
        <div ref={ref} className='relative m-auto'>
          {hovering && (
            <div className='absolute inset-0 bg-background/90 rounded-xl flex items-center justify-center transition-all duration-300 z-20 w-full h-full'>
              <div className='flex flex-col gap-2'>
                <Button
                  variant='text'
                  icon={<EyeIcon className='h-4 w-4' />}
                  className='text-white hover:text-primary'
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreviewOpen();
                  }}>
                  {t("crosshairs.preview")}
                </Button>
                <Button
                  disabled={applyCrosshairMutation.isPending}
                  variant='text'
                  isLoading={applyCrosshairMutation.isPending}
                  icon={<PencilIcon className='h-4 w-4' />}
                  className='text-white hover:text-primary'
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApply();
                  }}>
                  {applyCrosshairMutation.isPending
                    ? t("common.loading")
                    : t("crosshairs.form.apply")}
                </Button>
                {onRemove && (
                  <Button
                    variant='text'
                    icon={<TrashIcon className='h-4 w-4' />}
                    className='text-white hover:text-destructive'
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}>
                    {t("crosshairs.remove")}
                  </Button>
                )}
              </div>
            </div>
          )}
          <CrosshairCanvas
            config={crosshairConfig}
            interactive={false}
            width={200}
            height={200}
          />
        </div>
        {crosshair && (
          <div className='space-y-2 px-4 pb-4'>
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold text-sm truncate'>
                {crosshair.name}
              </h3>
            </div>

            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              <div className='flex items-center gap-1'>
                <span className='text-xs text-muted-foreground'>By</span>
                <span className='truncate max-w-[100px]'>
                  {crosshair.userName ?? "Unknown"}
                </span>
              </div>
            </div>

            {crosshair.heroes &&
              crosshair.heroes.length > 0 &&
              crosshair.heroes.some((h) => h !== "Default") && (
                <div className='flex flex-wrap gap-1'>
                  {crosshair.heroes
                    .filter((h) => h !== "Default")
                    .slice(0, 3)
                    .map((hero) => (
                      <Badge key={hero} variant='outline' className='text-xs'>
                        {hero}
                      </Badge>
                    ))}
                </div>
              )}
            {displayTags.length > 0 && (
              <div className='flex flex-wrap gap-1'>
                {displayTags.map((tag) => (
                  <Badge key={tag} variant='secondary' className='text-xs'>
                    {tag}
                  </Badge>
                ))}
                {remainingTags > 0 && (
                  <Badge variant='secondary' className='text-xs'>
                    +{remainingTags}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
