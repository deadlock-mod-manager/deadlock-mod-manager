import { formatBuildDate } from "@/lib/performance/import/review";
import type { ImportReport } from "@/types/generated/ImportReport";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useAppliedConfigName } from "./current-gameinfo-source";

export const NoHandEdits = ({ report }: { report: ImportReport }) => {
  const { t, i18n } = useTranslation();
  const appliedName = useAppliedConfigName();
  const stock = report.base
    ? t("performance.import.current.noEdits.stockBuild", {
        build: report.base.build,
        date: formatBuildDate(report.base.date, i18n.language),
      })
    : t("performance.import.current.noEdits.stock");
  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 px-8 text-center'>
      <span className='flex size-12 items-center justify-center rounded-full bg-emerald-500/10'>
        <CheckCircleIcon className='size-6 text-emerald-500' weight='bold' />
      </span>
      <p className='font-medium'>
        {t("performance.import.current.noEdits.title")}
      </p>
      <p className='max-w-md text-muted-foreground text-sm leading-relaxed'>
        {appliedName
          ? t("performance.import.current.noEdits.withApplied", {
              name: appliedName,
              stock,
            })
          : t("performance.import.current.noEdits.withoutApplied", { stock })}
      </p>
    </div>
  );
};
