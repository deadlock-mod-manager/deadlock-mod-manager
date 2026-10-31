import { formatBuildDate } from "@/lib/performance/import/review";
import type { ImportReport } from "@/types/generated/ImportReport";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export const FormatLine = ({
  report,
  presetName,
}: {
  report: ImportReport;
  presetName: string | null;
}) => {
  const { t, i18n } = useTranslation();
  const format = t(`performance.import.formats.${report.format}`);
  const line = report.base
    ? t(
        report.base.exact
          ? "performance.import.base.exact"
          : "performance.import.base.closest",
        {
          format,
          build: report.base.build,
          date: formatBuildDate(report.base.date, i18n.language),
        },
      )
    : format;
  return (
    <div className='flex flex-col gap-1'>
      <p className='flex items-center gap-2 text-sm'>
        <CheckCircleIcon
          className='size-4 shrink-0 text-emerald-500'
          weight='bold'
        />
        {line}
      </p>
      {presetName && (
        <p className='pl-6 text-muted-foreground text-xs'>
          {report.overrides.length > 0
            ? t("performance.import.preset.description", {
                preset: presetName,
                count: report.overrides.length,
              })
            : t("performance.import.preset.descriptionNoTweaks", {
                preset: presetName,
              })}
        </p>
      )}
    </div>
  );
};
