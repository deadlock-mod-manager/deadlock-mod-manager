import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { CrosshairIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCard } from "./crosshair-card";
import { CrosshairPreviewDialog } from "./crosshair-preview-dialog";

export const ActiveCrosshairs = () => {
  const { t } = useTranslation();
  const activeCrosshairHistory = usePersistedStore(
    (state) => state.activeCrosshairHistory,
  );
  const { setActiveCrosshair } = usePersistedStore();
  const [previewConfig, setPreviewConfig] = useState<CrosshairConfig | null>(
    null,
  );
  const queryClient = useQueryClient();

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: CrosshairConfig) =>
      invoke("apply_crosshair_to_autoexec", { config: crosshairConfig }),
    onSuccess: () => {
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.error(error);
      toast.error(t("crosshairs.form.applyError"));
    },
  });

  const handleApply = () => {
    if (!previewConfig) return;
    setActiveCrosshair(previewConfig);
    applyCrosshairMutation.mutate(previewConfig);
  };

  if (activeCrosshairHistory.length === 0) {
    return (
      <div className='mb-6'>
        <h2 className='text-lg font-semibold mb-4'>
          {t("crosshairs.activeCrosshairs")}
        </h2>
        <Card>
          <CardContent className='p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground'>
            <CrosshairIcon className='h-12 w-12 opacity-50' />
            <p className='text-sm'>{t("crosshairs.noActiveCrosshair")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='mb-6'>
      <h2 className='text-lg font-semibold mb-4'>
        {t("crosshairs.activeCrosshairs")}
      </h2>
      <div className='flex gap-4 overflow-x-auto scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin pb-2'>
        {activeCrosshairHistory.map(
          (config: CrosshairConfig, index: number) => (
            <div
              key={JSON.stringify(config)}
              className='flex-shrink-0 w-[200px]'>
              <CrosshairCard
                config={config}
                isActive={index === 0}
                onPreviewOpen={() => setPreviewConfig(config)}
              />
            </div>
          ),
        )}
      </div>
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
    </div>
  );
};
