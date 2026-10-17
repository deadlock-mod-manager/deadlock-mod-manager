import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import {
  CheckCircle2,
  ChevronDown,
  TriangleAlert,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { groupAssetRepairs } from "@/lib/mods/compatibility";

export interface AssetRepair {
  modId: string;
  sourceVpk: string;
  filePath: string;
  kind:
    | "animationSkeleton"
    | "animationSkeletonRebased"
    | "animationInterface"
    | "animationClipTracks"
    | "animationRigRebase"
    | "cameraInterface"
    | "cameraControls"
    | "cameraAttachmentFrame"
    | "materialBindings"
    | "modelRelocation";
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
    | "missingCameraInterface"
    | "outdatedCameraAttachments"
    | "missingAnimationInterface"
    | "animationMapping"
    | "unreadableResource"
    | "materialMapping"
    | "materialInterface"
    | "modelMapping"
    | "overlappingModel";
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
        {groupAssetRepairs(repairs).map((group) => (
          <li
            className='flex items-start gap-2'
            key={JSON.stringify([group.modId, group.kind])}>
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
            <div className='min-w-0 flex-1'>
              <p className='font-medium'>
                {modNames.get(group.modId) ?? group.modId}
                {" · "}
                {t(`modOrdering.compatibility.repairs.${group.kind}`)}
              </p>
              {group.files.length === 1 ? (
                <code className='mt-0.5 block break-all text-muted-foreground'>
                  {group.files[0]?.filePath}
                </code>
              ) : (
                <Collapsible>
                  <CollapsibleTrigger
                    className='group mt-1 flex items-center gap-1 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
                    data-testid='compatibility-repair-files-toggle'>
                    <ChevronDown
                      aria-hidden
                      className='h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90'
                    />
                    {t("modOrdering.compatibility.affectedFiles", {
                      count: group.files.length,
                    })}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className='mt-2 max-h-48 space-y-1 overflow-y-auto text-muted-foreground'>
                      {group.files.map((file) => (
                        <li
                          key={JSON.stringify([file.sourceVpk, file.filePath])}>
                          <code className='block break-all'>
                            {file.filePath}
                          </code>
                          <span className='text-[10px]'>{file.sourceVpk}</span>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )}
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
