import { Button } from "@deadlock-mods/ui/components/button";
import { RotateCcw } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const IgnoredRow = ({
  label,
  onRestore,
  disabled,
  testId,
}: {
  label: React.ReactNode;
  onRestore?: () => void;
  disabled: boolean;
  testId?: string;
}) => {
  const { t } = useTranslation();
  return (
    <li
      className='flex min-h-9 items-center gap-3 px-3 py-1'
      data-testid={testId}>
      <div className='min-w-0 flex-1 truncate text-sm'>{label}</div>
      {onRestore && (
        <Button
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
