import { Info, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export interface CompiledDataBaseline {
  modId: string;
  sourceVpk: string;
  filePath: string;
  status: "matched" | "legacyApproximate" | "ambiguous" | "unavailable";
  buildVersions: number[];
  comparableRows: number;
  changedRows: number;
}

interface BaselineCompatibilityReportProps {
  baselines: readonly CompiledDataBaseline[];
  modNames: ReadonlyMap<string, string>;
}

export function BaselineCompatibilityReport({
  baselines,
  modNames,
}: BaselineCompatibilityReportProps) {
  const { t } = useTranslation();
  if (baselines.length === 0) return null;
  return (
    <section className='space-y-3 rounded-md border bg-muted/20 px-4 py-3'>
      <p className='font-medium text-sm'>{t("modOrdering.baselines.title")}</p>
      <ul className='space-y-3 text-xs'>
        {baselines.map((baseline) => {
          const Icon = baseline.status === "matched" ? Info : TriangleAlert;
          return (
            <li
              className='flex items-start gap-2'
              key={`${baseline.modId}:${baseline.sourceVpk}:${baseline.filePath}`}>
              <Icon className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
              <div className='min-w-0'>
                <p className='font-medium'>
                  {modNames.get(baseline.modId) ?? baseline.modId}
                </p>
                <code className='mt-0.5 block break-all text-muted-foreground'>
                  {baseline.filePath}
                </code>
                <p className='mt-1 text-muted-foreground'>
                  {t(`modOrdering.baselines.${baseline.status}`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
