import { Button } from "@deadlock-mods/ui/components/button";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

interface PickerActionBarProps {
  changes: number;
  dirty: boolean;
  blockedCount: number;
  totalCount: number;
  disabled: boolean;
  applying: boolean;
  gameRunning: boolean;
  onDiscard: () => void;
  onApply: () => void;
}

export const PickerActionBar = ({
  changes,
  dirty,
  blockedCount,
  totalCount,
  disabled,
  applying,
  gameRunning,
  onDiscard,
  onApply,
}: PickerActionBarProps) => {
  const { t } = useTranslation();
  const allBlocked = totalCount > 0 && blockedCount >= totalCount;
  return (
    <div className='flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background pt-3'>
      <div className='min-w-0 space-y-0.5' aria-live='polite'>
        <p className='text-sm font-medium'>
          {t(
            changes > 0
              ? "serverPicker.pendingChanges"
              : "serverPicker.reconcile",
            { count: changes },
          )}
        </p>
        {(gameRunning || allBlocked) && (
          <p className='max-w-prose text-xs text-muted-foreground'>
            {t(
              gameRunning
                ? "serverPicker.closeGame"
                : "serverPicker.allBlockedWarning",
            )}
          </p>
        )}
      </div>
      <div className='ml-auto flex items-center gap-2'>
        <Button
          disabled={disabled || !dirty}
          onClick={onDiscard}
          variant='ghost'>
          {t("serverPicker.discard")}
        </Button>
        <Button
          disabled={disabled || allBlocked || gameRunning}
          isLoading={applying}
          onClick={onApply}>
          {!applying && <ShieldCheckIcon aria-hidden />}
          {t("serverPicker.apply")}
        </Button>
      </div>
    </div>
  );
};
