import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DiffLine, Option, Preset } from "@/types/game-presets";

type ApplyPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: Preset | null;
  options: Option[];
  currentConfig: Record<string, string>;
  onApply: () => void;
};

export const ApplyPreviewDialog = ({
  open,
  onOpenChange,
  preset,
  options,
  currentConfig,
  onApply,
}: ApplyPreviewDialogProps) => {
  const { t } = useTranslation();

  if (!preset) return null;

  const diffs: DiffLine[] = [];

  for (const [optionId, newValue] of Object.entries(preset.values)) {
    const option = options.find((opt) => opt.id === optionId);
    if (!option) continue;

    const oldValue = currentConfig[option.varName];

    if (oldValue === undefined) {
      diffs.push({ key: option.varName, newValue, kind: "add" });
    } else if (oldValue !== newValue) {
      diffs.push({ key: option.varName, oldValue, newValue, kind: "change" });
    }
  }

  for (const [key, oldValue] of Object.entries(currentConfig)) {
    const option = options.find((opt) => opt.varName === key);
    if (!option) continue;

    const hasNewValue = preset.values[option.id] !== undefined;
    if (!hasNewValue) {
      diffs.push({ key, oldValue, kind: "remove" });
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t("gamePresets.applyPreset")}: {preset.name}
          </DialogTitle>
          <DialogDescription>
            {t("gamePresets.applyPreviewDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <div className='max-h-96 overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-sm'>
            {diffs.length === 0 ? (
              <p className='text-center text-muted-foreground'>
                {t("gamePresets.noChanges")}
              </p>
            ) : (
              <div className='space-y-2'>
                {diffs.map((diff, index) => (
                  <div
                    key={`${diff.key}-${index}`}
                    className='flex items-start gap-2 rounded-md bg-background/50 p-2'>
                    {diff.kind === "add" && (
                      <>
                        <Badge className='mt-0.5 shrink-0' variant='default'>
                          +
                        </Badge>
                        <span className='text-green-600 dark:text-green-400'>
                          {diff.key} = {diff.newValue}
                        </span>
                      </>
                    )}
                    {diff.kind === "remove" && (
                      <>
                        <Badge
                          className='mt-0.5 shrink-0'
                          variant='destructive'>
                          −
                        </Badge>
                        <span className='text-red-600 dark:text-red-400'>
                          {diff.key} = {diff.oldValue}
                        </span>
                      </>
                    )}
                    {diff.kind === "change" && (
                      <>
                        <Badge className='mt-0.5 shrink-0' variant='secondary'>
                          ~
                        </Badge>
                        <div className='flex flex-col gap-1'>
                          <span className='text-red-600 line-through dark:text-red-400'>
                            {diff.key} = {diff.oldValue}
                          </span>
                          <span className='text-green-600 dark:text-green-400'>
                            {diff.key} = {diff.newValue}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='outline'>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}>
            {t("gamePresets.applyConfig")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

