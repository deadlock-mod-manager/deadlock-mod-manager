import { useTranslation } from "react-i18next";
import type { ModdingRepairIssue } from "@/types/generated/ModdingRepairIssue";
import { AssetImportCheckbox } from "./asset-import-checkbox";

interface Props {
  issue: ModdingRepairIssue;
  selected: boolean;
  disabled: boolean;
  onSelect: (selected: boolean) => void;
}

export function RepairIssueRow({ issue, selected, disabled, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <li className='flex items-start gap-3 border-b px-4 py-3 last:border-0'>
      {issue.repairable ? (
        <AssetImportCheckbox
          checked={selected}
          disabled={disabled}
          label={t("workbenchRepair.selectRepair", { file: issue.file })}
          onCheckedChange={onSelect}
        />
      ) : null}
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='text-sm font-medium'>
          {t(`workbenchRepair.kinds.${issue.kind}`)}
        </p>
        {issue.file ? (
          <p className='break-all font-mono text-xs'>{issue.file}</p>
        ) : null}
        <p className='max-w-prose text-xs text-muted-foreground'>
          {t(`workbenchRepair.descriptions.${issue.kind}`)}
        </p>
        {issue.current ? (
          <p className='break-all font-mono text-xs text-muted-foreground'>
            {issue.property ? `${issue.property}: ` : ""}
            {issue.current}
          </p>
        ) : null}
        {issue.proposed ? (
          <p className='break-all font-mono text-xs'>
            {t("workbenchRepair.proposed", { value: issue.proposed })}
          </p>
        ) : null}
        {issue.targets.length ? (
          <details className='text-xs text-muted-foreground'>
            <summary className='cursor-pointer'>
              {t(
                issue.kind === "stockDependency"
                  ? "workbenchRepair.exportedFiles"
                  : "workbenchRepair.relatedFiles",
                { count: issue.targets.length },
              )}
            </summary>
            <ul className='mt-1 space-y-1'>
              {issue.targets.map((target) => (
                <li key={target} className='break-all font-mono'>
                  {target}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {issue.detail ? (
          <details className='text-xs text-muted-foreground'>
            <summary className='cursor-pointer'>
              {t("workbenchRepair.technicalDetails")}
            </summary>
            <p className='mt-1 max-w-prose break-words'>{issue.detail}</p>
          </details>
        ) : null}
      </div>
    </li>
  );
}
