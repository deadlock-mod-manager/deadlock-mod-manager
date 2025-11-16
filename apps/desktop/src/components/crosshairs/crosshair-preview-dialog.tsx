import {
  BACKGROUND_LABELS,
  BACKGROUND_PATHS,
  type BackgroundKey,
} from "@deadlock-mods/crosshair/backgrounds";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";

interface CrosshairPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crosshair?: PublishedCrosshairDto;
  config?: CrosshairConfig;
}

export const CrosshairPreviewDialog = ({
  open,
  onOpenChange,
  crosshair,
  config,
}: CrosshairPreviewDialogProps) => {
  const { t } = useTranslation();
  const [background, setBackground] = useState<BackgroundKey>("bg1");

  const crosshairConfig = crosshair?.config ?? config;
  if (!crosshairConfig) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {crosshair?.name ?? t("crosshairs.previewDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
            <h3 className='text-lg font-semibold'>
              {t("crosshairs.previewDialog.title")}
            </h3>
            <div className='flex gap-2 flex-wrap'>
              <Button
                variant={background === null ? "default" : "outline"}
                size='sm'
                onClick={() => setBackground(null)}>
                {t("crosshairs.previewDialog.noBackground")}
              </Button>
              {Object.keys(BACKGROUND_PATHS).map((key) => {
                const bgKey = key as NonNullable<BackgroundKey>;
                return (
                  <Button
                    key={key}
                    variant={background === bgKey ? "default" : "outline"}
                    size='sm'
                    onClick={() => setBackground(bgKey)}>
                    {BACKGROUND_LABELS[bgKey]}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className='bg-zinc-800 rounded-lg overflow-hidden aspect-video'>
            <CrosshairCanvas
              config={crosshairConfig}
              interactive
              background={background ?? undefined}
            />
          </div>
          <p className='text-sm text-muted-foreground'>
            {t("crosshairs.previewDialog.hint")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
