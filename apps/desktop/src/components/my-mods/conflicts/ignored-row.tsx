import { Button } from "@deadlock-mods/ui/components/button";
import { RotateCcw } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { LocalMod } from "@/types/mods";
import { ModCover } from "./mod-cover";

const CoverStack = ({ mods }: { mods: (LocalMod | undefined)[] }) => (
  <div aria-hidden className='flex shrink-0 -space-x-2'>
    {mods.map((mod, index) => (
      <ModCover
        className='h-6 w-6 rounded ring-2 ring-background'
        key={mod?.remoteId ?? index}
        mod={mod}
      />
    ))}
  </div>
);

export const IgnoredRow = ({
  label,
  mods,
  onRestore,
  disabled,
  testId,
}: {
  label: string;
  mods: (LocalMod | undefined)[];
  onRestore?: () => void;
  disabled: boolean;
  testId?: string;
}) => {
  const { t } = useTranslation();
  return (
    <li
      className='flex min-h-11 items-center gap-3 px-3 py-1.5'
      data-testid={testId}>
      <CoverStack mods={mods} />
      <div
        className='min-w-0 flex-1 truncate text-muted-foreground text-sm'
        title={label}>
        {label}
      </div>
      {onRestore && (
        <Button
          className='text-muted-foreground hover:text-foreground'
          disabled={disabled}
          icon={<RotateCcw className='h-3.5 w-3.5' />}
          onClick={onRestore}
          size='sm'
          variant='ghost'>
          {t("conflicts.restore")}
        </Button>
      )}
    </li>
  );
};
