import { useTranslation } from "react-i18next";
import type { ModRecoveryReport } from "@/lib/mods/recovery";

export const ModRecoveryReportView = ({
  report,
}: {
  report: ModRecoveryReport;
}) => {
  const { t } = useTranslation();
  if (report.failures.length === 0) return null;
  return (
    <div
      role='alert'
      className='rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm'>
      <p>
        {t("settings.clearModsPartial", {
          removed: report.removed,
          failed: report.failures.length,
        })}
      </p>
      <p className='mt-1 text-muted-foreground'>
        {t("settings.clearModsRetry")}
      </p>
      <ul className='mt-3 max-h-64 space-y-2 overflow-y-auto'>
        {report.failures.map(({ remoteId, name, message }) => (
          <li key={remoteId} className='break-words'>
            <span className='font-medium'>
              {name} ({remoteId})
            </span>
            : {message}
          </li>
        ))}
      </ul>
    </div>
  );
};
