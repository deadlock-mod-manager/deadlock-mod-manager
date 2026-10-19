import { Button } from "@deadlock-mods/ui/components/button";
import { Loader2, Power, PowerOff } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

type LibrarySelectionBarProps = {
  count: number;
  canEnable: boolean;
  canDisable: boolean;
  busy: boolean;
  working: boolean;
  onSelectFiltered: () => void;
  onClear: () => void;
  onDone: () => void;
  onEnable: () => void;
  onDisable: () => void;
};

export const LibrarySelectionBar = ({
  count,
  canEnable,
  canDisable,
  busy,
  working,
  onSelectFiltered,
  onClear,
  onDone,
  onEnable,
  onDisable,
}: LibrarySelectionBarProps) => {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("myMods.selection.start")}
      role='region'
      className='flex shrink-0 flex-wrap items-center gap-2 border-y bg-card px-4 py-3'>
      <span aria-live='polite' className='mr-auto text-sm font-medium'>
        {t("myMods.selection.count", { count })}
      </span>
      {working && (
        <span
          role='status'
          className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 aria-hidden className='size-4 animate-spin' />
          {t("myMods.selection.working")}
        </span>
      )}
      <Button
        size='sm'
        variant='ghost'
        disabled={busy}
        onClick={onSelectFiltered}>
        {t("myMods.selection.selectFiltered")}
      </Button>
      <Button
        size='sm'
        variant='ghost'
        disabled={busy || count === 0}
        onClick={onClear}>
        {t("myMods.selection.clear")}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy || !canEnable}
        onClick={onEnable}
        icon={<Power className='size-4' />}>
        {t("myMods.selection.enable")}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy || !canDisable}
        onClick={onDisable}
        icon={<PowerOff className='size-4' />}>
        {t("myMods.selection.disable")}
      </Button>
      <Button size='sm' variant='ghost' disabled={busy} onClick={onDone}>
        {t("myMods.selection.done")}
      </Button>
    </div>
  );
};
