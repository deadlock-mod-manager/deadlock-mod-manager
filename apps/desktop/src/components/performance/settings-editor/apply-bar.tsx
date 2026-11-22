import { Button } from "@deadlock-mods/ui/components/button";
import { CheckIcon, InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

type ApplyBarProps = {
  configName: string;
  unsavedCount: number;
  canApply: boolean;
  isApplying: boolean;
  onDiscard: () => void;
  onApply: () => void;
};

/** Sticky footer while the editor holds edits, or a config that isn't the applied one. */
export const ApplyBar = ({
  configName,
  unsavedCount,
  canApply,
  isApplying,
  onDiscard,
  onApply,
}: ApplyBarProps) => {
  const { t } = useTranslation();
  let message = t("performance.editor.applyBar.notApplied", {
    name: configName,
  });
  if (!canApply) message = t("performance.editor.applyBar.noGameinfo");
  else if (unsavedCount > 0) {
    message = t("performance.editor.applyBar.unsaved", { count: unsavedCount });
  }

  return (
    <div className='sticky bottom-0 z-20 mt-4 pb-1'>
      <div
        aria-live='polite'
        className='flex items-center gap-3 rounded-lg border border-primary/40 bg-card px-4 py-3 shadow-lg'
        role='status'>
        <InfoIcon className='size-4 shrink-0 text-primary' />
        <p className='min-w-0 flex-1 text-sm'>{message}</p>
        {unsavedCount > 0 && (
          <Button
            disabled={isApplying}
            onClick={onDiscard}
            size='sm'
            variant='ghost'>
            {t("performance.editor.applyBar.discard")}
          </Button>
        )}
        <Button
          disabled={!canApply}
          icon={<CheckIcon />}
          isLoading={isApplying}
          onClick={onApply}
          size='sm'>
          {unsavedCount > 0
            ? t("performance.editor.applyBar.apply")
            : t("performance.editor.applyBar.applyConfig")}
        </Button>
      </div>
    </div>
  );
};
