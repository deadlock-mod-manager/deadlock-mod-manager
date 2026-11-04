import { Alert } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePerformanceUi } from "./performance-context";

/** Edits no config or known tool made, offered as a config of their own. */
export const UnmanagedChangesNotice = ({ count }: { count: number }) => {
  const { t } = useTranslation();
  const { openImport } = usePerformanceUi();
  if (count === 0) return null;
  return (
    <Alert className='py-2'>
      <InfoIcon className='size-4 shrink-0 text-muted-foreground' />
      <p className='min-w-0 flex-1 text-muted-foreground'>
        {t("performance.activeStatus.unmanaged", { count })}
      </p>
      <Button
        onClick={() => openImport({ kind: "currentGameinfo" })}
        size='sm'
        variant='outline'>
        {t("performance.activeStatus.saveUnmanaged")}
      </Button>
    </Alert>
  );
};
