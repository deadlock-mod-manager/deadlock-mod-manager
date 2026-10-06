import { CheckCircle2, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export interface DataRepair {
  modId: string;
  sourceVpk: string;
  filePath: string;
  rowName: string;
  kind:
    | "heroDevelopmentState"
    | "inheritedDefinition"
    | "retainedDependency"
    | "currentReference"
    | "enumMapEntry";
  detail: string;
}

export interface DataWarning {
  modId: string;
  sourceVpk: string;
  filePath: string;
  rowName: string;
  kind:
    | "missingDefinition"
    | "unverifiedDefinition"
    | "unverifiedInheritance"
    | "missingDevelopmentState"
    | "omittedHeroDefinition"
    | "omittedEnumMapEntry";
  fieldPath: string;
  targetFile: string;
  targetRow: string;
  reason:
    | "definitionUnavailable"
    | "competingDefinitions"
    | "unrecognizedClassOrEnum"
    | "ambiguousTemplates"
    | "inheritanceCycle"
    | "visibilityMigrationUnverified";
  detail: string;
}

interface DataCompatibilityReportProps {
  repairs: readonly DataRepair[];
  warnings: readonly DataWarning[];
  modNames: ReadonlyMap<string, string>;
}

export function DataCompatibilityReport({
  repairs,
  warnings,
  modNames,
}: DataCompatibilityReportProps) {
  const { t } = useTranslation();
  if (repairs.length === 0 && warnings.length === 0) return null;

  return (
    <section className='space-y-3 rounded-md border bg-muted/20 px-4 py-3'>
      <div>
        <p className='font-medium text-sm'>
          {t("modOrdering.dataCompatibility.title")}
        </p>
        <p className='mt-1 text-muted-foreground text-xs leading-relaxed'>
          {t("modOrdering.dataCompatibility.description")}
        </p>
      </div>
      <ul className='space-y-3 text-xs'>
        {repairs.map((repair) => (
          <li
            className='flex items-start gap-2'
            key={`${repair.modId}:${repair.sourceVpk}:${repair.filePath}:${repair.rowName}:${repair.kind}:${repair.detail}`}>
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
            <div className='min-w-0'>
              <p className='font-medium'>
                {modNames.get(repair.modId) ?? repair.modId}
                {" · "}
                {t(`modOrdering.dataCompatibility.repairs.${repair.kind}`)}
              </p>
              <code className='mt-0.5 block break-all text-muted-foreground'>
                {repair.filePath} · {repair.rowName}
                {repair.detail ? ` · ${repair.detail}` : null}
              </code>
            </div>
          </li>
        ))}
        {warnings.map((warning) => (
          <li
            className='flex items-start gap-2'
            key={`${warning.modId}:${warning.sourceVpk}:${warning.filePath}:${warning.rowName}:${warning.fieldPath}:${warning.targetRow}`}>
            <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0 text-amber-400' />
            <div className='min-w-0'>
              <p className='font-medium'>
                {modNames.get(warning.modId) ?? warning.modId}
                {" · "}
                {t(`modOrdering.dataCompatibility.warnings.${warning.kind}`)}
              </p>
              <code className='mt-0.5 block break-all text-muted-foreground'>
                {warning.filePath} · {warning.rowName}
                {warning.fieldPath ? ` · ${warning.fieldPath}` : null}
              </code>
              <p className='mt-1 text-muted-foreground'>
                {t(`modOrdering.dataCompatibility.reasons.${warning.reason}`)}
              </p>
              {warning.targetRow ? (
                <code className='mt-0.5 block break-all text-muted-foreground'>
                  {warning.targetFile} · {warning.targetRow}
                </code>
              ) : null}
              {warning.detail &&
              warning.detail !==
                `${warning.targetFile}:${warning.targetRow}` ? (
                <code className='mt-0.5 block break-all text-muted-foreground'>
                  {warning.detail}
                </code>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t("modOrdering.dataCompatibility.warningDescription")}
        </p>
      ) : null}
    </section>
  );
}
