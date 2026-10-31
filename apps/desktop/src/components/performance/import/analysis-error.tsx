import { getErrorMessage } from "@/lib/errors";
import type { ImportSource } from "@/types/generated/ImportSource";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export const AnalysisError = ({
  source,
  error,
}: {
  source: ImportSource;
  error: Error;
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4'>
      <p className='flex items-center gap-2 font-medium text-sm'>
        <WarningCircleIcon
          className='size-4 shrink-0 text-destructive'
          weight='bold'
        />
        {t(`performance.import.errors.${source.kind}.title`)}
      </p>
      <p className='text-muted-foreground text-sm'>
        {t(`performance.import.errors.${source.kind}.description`)}
      </p>
      <p className='break-words font-mono text-muted-foreground text-xs'>
        {getErrorMessage(error)}
      </p>
    </div>
  );
};
