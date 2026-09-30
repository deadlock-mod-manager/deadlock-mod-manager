import { CheckCircle2, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export interface AssetRepair {
  modId: string;
  sourceVpk: string;
  filePath: string;
  kind: "animationSkeleton" | "animationSkeletonRebased" | "cameraInterface";
}

export interface AssetWarning {
  modId: string;
  sourceVpk: string;
  filePath: string;
  kind:
    | "unverifiedSkeleton"
    | "invalidSkeleton"
    | "invalidBoneRemapping"
    | "invalidAttachment"
    | "invalidHitbox"
    | "missingResource"
    | "unreadableResource";
  detail: string;
}

interface AssetCompatibilityReportProps {
  repairs: readonly AssetRepair[];
  warnings: readonly AssetWarning[];
  modNames: ReadonlyMap<string, string>;
}

export function AssetCompatibilityReport({
  repairs,
  warnings,
  modNames,
}: AssetCompatibilityReportProps) {
  const { t } = useTranslation();
  if (repairs.length === 0 && warnings.length === 0) {
    return null;
  }
  return (
    <section className='space-y-3 rounded-md border bg-muted/20 px-4 py-3'>
      <div>
        <p className='font-medium text-sm'>
          {t("modOrdering.compatibility.title")}
        </p>
        <p className='mt-1 text-muted-foreground text-xs leading-relaxed'>
          {t("modOrdering.compatibility.description")}
        </p>
      </div>
      <ul className='space-y-3 text-xs'>
        {repairs.map((repair) => (
          <li
            className='flex items-start gap-2'
            key={`${repair.modId}:${repair.sourceVpk}:${repair.filePath}:${repair.kind}`}>
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
            <div className='min-w-0'>
              <p className='font-medium'>
                {modNames.get(repair.modId) ?? repair.modId}
                {" · "}
                {t(`modOrdering.compatibility.repairs.${repair.kind}`)}
              </p>
              <code className='mt-0.5 block break-all text-muted-foreground'>
                {repair.filePath}
              </code>
            </div>
          </li>
        ))}
        {warnings.map((warning) => (
          <li
            className='flex items-start gap-2'
            key={`${warning.modId}:${warning.sourceVpk}:${warning.filePath}:${warning.kind}:${warning.detail}`}>
            <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0 text-amber-400' />
            <div className='min-w-0'>
              <p className='font-medium'>
                {modNames.get(warning.modId) ?? warning.modId}
                {" · "}
                {t(`modOrdering.compatibility.warnings.${warning.kind}`)}
              </p>
              <code className='mt-0.5 block break-all text-muted-foreground'>
                {warning.filePath}
              </code>
              <code className='mt-0.5 block break-all text-muted-foreground'>
                {warning.detail}
              </code>
            </div>
          </li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t("modOrdering.compatibility.warningDescription")}
        </p>
      ) : null}
    </section>
  );
}
