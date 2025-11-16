import {
  BACKGROUND_LABELS,
  BACKGROUND_PATHS,
  type BackgroundKey,
} from "@deadlock-mods/crosshair/backgrounds";
import { generateConfigString } from "@deadlock-mods/crosshair/config-generator";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Clipboard, PencilIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";

interface CrosshairPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crosshair?: PublishedCrosshairDto;
  config?: CrosshairConfig;
  onApply?: () => void;
  isApplying?: boolean;
}

export const CrosshairPreviewDialog = ({
  open,
  onOpenChange,
  crosshair,
  config,
  onApply,
  isApplying = false,
}: CrosshairPreviewDialogProps) => {
  const { t } = useTranslation();
  const [background, setBackground] = useState<BackgroundKey>("bg1");

  const crosshairConfig = crosshair?.config ?? config;
  if (!crosshairConfig) {
    return null;
  }

  const formatValue = (value: number | boolean | string) => {
    if (typeof value === "boolean") {
      return value ? t("common.yes") : t("common.no");
    }
    if (typeof value === "number") {
      return value.toFixed(value % 1 === 0 ? 0 : 1);
    }
    return String(value);
  };

  const formatColor = (color: { r: number; g: number; b: number }) => {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  const handleCopyCommand = async () => {
    try {
      const commandString = generateConfigString(crosshairConfig);
      await navigator.clipboard.writeText(commandString);
      toast.success(t("crosshairs.previewDialog.commandCopied"));
    } catch (error) {
      toast.error(t("crosshairs.previewDialog.commandCopyFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-5xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {crosshair?.name ?? t("crosshairs.previewDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='flex flex-row gap-4 items-start'>
            <div className='flex flex-col gap-2 w-1/3'>
              <h4 className='font-semibold text-sm mb-2'>
                {t("crosshairs.previewDialog.configValues")}
              </h4>
              <div className='flex flex-col gap-3 text-sm w-full'>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.gap")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.gap)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.width")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.width)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.height")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.height)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.pipOpacity")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.pipOpacity)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.dotOpacity")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.dotOpacity)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.dotOutlineOpacity")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.dotOutlineOpacity)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.color")}
                  </span>
                  <div className='flex items-center gap-2'>
                    <span
                      className='inline-block w-4 h-4 rounded border border-border'
                      style={{
                        backgroundColor: formatColor(crosshairConfig.color),
                      }}
                    />
                    <span className='font-mono text-xs font-medium'>
                      {formatColor(crosshairConfig.color)}
                    </span>
                  </div>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.pipBorder")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.pipBorder)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.pipGapStatic")}
                  </span>
                  <span className='font-mono font-medium'>
                    {formatValue(crosshairConfig.pipGapStatic)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>
                    {t("crosshairs.previewDialog.hero")}
                  </span>
                  <span className='font-medium'>{crosshairConfig.hero}</span>
                </div>
              </div>
            </div>
            <div className='flex flex-col gap-2 w-2/3'>
              <div className='flex flex-col justify-center items-center gap-4'>
                <div className='flex gap-2 flex-wrap '>
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
                <div className='rounded-lg w-full h-56'>
                  <CrosshairCanvas
                    config={crosshairConfig}
                    interactive
                    height={224}
                    background={background ?? undefined}
                  />
                </div>
              </div>
              <p className='text-sm text-muted-foreground mt-2'>
                {t("crosshairs.previewDialog.hint")}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            icon={<Clipboard className='h-4 w-4' />}
            onClick={handleCopyCommand}>
            {t("ui.copyToClipboard")}
          </Button>
          {onApply && (
            <Button
              disabled={isApplying}
              icon={<PencilIcon className='h-4 w-4' />}
              isLoading={isApplying}
              onClick={onApply}>
              {isApplying ? t("common.loading") : t("crosshairs.form.apply")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
