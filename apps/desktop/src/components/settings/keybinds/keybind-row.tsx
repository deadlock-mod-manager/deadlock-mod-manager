import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { RotateCcw, X } from "@deadlock-mods/ui/icons";
import { platform } from "@tauri-apps/plugin-os";
import { type KeyboardEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyCombo } from "@/components/shared/key-combo";
import {
  comboFromEvent,
  type KeybindAction,
  type KeybindValidation,
  type KeyCombo as Combo,
  validateCombo,
} from "@/lib/keybinds";
import { cn } from "@/lib/utils";

type KeybindRowProps = {
  action: KeybindAction;
  combo: Combo | null;
  isCustomized: boolean;
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
  onChange: (combo: Combo | null) => void;
  onReset: () => void;
};

type RecordingError = Exclude<KeybindValidation, "ok">;

const hasModifier = (event: KeyboardEvent) =>
  event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;

export const KeybindRow = ({
  action,
  combo,
  isCustomized,
  recording,
  onRecordingChange,
  onChange,
  onReset,
}: KeybindRowProps) => {
  const { t } = useTranslation();
  const errorId = useId();
  const [error, setError] = useState<RecordingError | null>(null);
  const label = t(`keybinds.actions.${action}`);

  const handleRecordKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab" && !hasModifier(event)) {
      onRecordingChange(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape" && !hasModifier(event)) {
      onRecordingChange(false);
      return;
    }
    const recorded = comboFromEvent(event.nativeEvent, platform());
    if (!recorded) return;

    const validation = validateCombo(recorded);
    if (validation !== "ok") {
      setError(validation);
      return;
    }
    setError(null);
    onRecordingChange(false);
    onChange(recorded);
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-card/50 py-1.5 pr-1.5 pl-3 transition-colors",
        recording ? "border-primary/60" : "hover:border-border",
      )}>
      <div className='grid grid-cols-[minmax(0,1fr)_8.5rem_auto] items-center gap-2'>
        <span className='truncate text-sm' title={label}>
          {label}
        </span>
        <Button
          aria-describedby={error ? errorId : undefined}
          aria-label={t("keybinds.edit", { action: label })}
          aria-pressed={recording}
          className={cn(
            "h-7 w-full justify-center px-2 font-normal",
            recording && "border-primary bg-primary/10 ring-1 ring-primary/40",
          )}
          onBlur={() => onRecordingChange(false)}
          onClick={() => {
            setError(null);
            onRecordingChange(!recording);
          }}
          onKeyDown={recording ? handleRecordKey : undefined}
          size='sm'
          variant='outline'>
          {recording ? (
            <span className='text-primary text-xs'>
              {t("keybinds.pressKeys")}
            </span>
          ) : combo ? (
            <KeyCombo combo={combo} />
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t("keybinds.notSet")}
            </span>
          )}
        </Button>
        <div className='flex gap-0.5'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("keybinds.reset", { action: label })}
                className={cn("size-7", !isCustomized && "invisible")}
                disabled={!isCustomized}
                onClick={onReset}
                size='icon'
                variant='ghost'>
                <RotateCcw className='size-3.5' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("keybinds.resetTooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("keybinds.unbind", { action: label })}
                className={cn("size-7", !combo && "invisible")}
                disabled={!combo}
                onClick={() => onChange(null)}
                size='icon'
                variant='ghost'>
                <X className='size-3.5' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("keybinds.unbindTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {error && (
        <p
          className='mt-1 pr-1.5 text-destructive text-xs'
          id={errorId}
          role='alert'>
          {t(`keybinds.errors.${error}`)}
        </p>
      )}
    </div>
  );
};
