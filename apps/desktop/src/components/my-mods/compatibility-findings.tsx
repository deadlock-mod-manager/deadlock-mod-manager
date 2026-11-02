import { CompatibilityModRow } from "./compatibility-mod-row";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import { useTranslation } from "react-i18next";
import { groupFindingsByMod } from "@/lib/mods/compatibility";
import type { AssetRepair, AssetWarning } from "./asset-compatibility-report";
import type { DataRepair, DataWarning } from "./data-compatibility-report";

interface FindingEntry {
  key: string;
  filePath: string;
  context: string[];
  note?: string;
  details: string[];
}

function FindingEntries({ entries }: { entries: readonly FindingEntry[] }) {
  return (
    <ul className='mt-1 space-y-2'>
      {entries.map((entry) => (
        <li className='min-w-0 space-y-0.5' key={entry.key}>
          <code className='block break-all text-[11px] text-muted-foreground'>
            {entry.filePath}
          </code>
          {entry.context.length > 0 ? (
            <span className='flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground'>
              {entry.context.map((part) => (
                <span className='break-all' key={part}>
                  {part}
                </span>
              ))}
            </span>
          ) : null}
          {entry.note ? (
            <p className='text-muted-foreground text-xs'>{entry.note}</p>
          ) : null}
          {entry.details.map((detail) => (
            <code
              className='block break-all text-[11px] text-muted-foreground/70'
              key={detail}>
              {detail}
            </code>
          ))}
        </li>
      ))}
    </ul>
  );
}

interface CompatibilityWarningsProps {
  embedded?: boolean;
  assetWarnings: readonly AssetWarning[];
  dataWarnings: readonly DataWarning[];
  modNames: ReadonlyMap<string, string>;
}

export function CompatibilityWarnings({
  embedded = false,
  assetWarnings,
  dataWarnings,
  modNames,
}: CompatibilityWarningsProps) {
  const { t } = useTranslation();
  const mods = groupFindingsByMod<FindingEntry>([
    ...assetWarnings.map((warning) => ({
      modId: warning.modId,
      label: t(`modOrdering.compatibility.warnings.${warning.kind}`),
      entry: {
        key: JSON.stringify([
          warning.sourceVpk,
          warning.filePath,
          warning.kind,
          warning.detail,
        ]),
        filePath: warning.filePath,
        context: [],
        details: warning.detail ? [warning.detail] : [],
      },
    })),
    ...dataWarnings.map((warning) => {
      const target = warning.targetRow
        ? `${warning.targetFile}:${warning.targetRow}`
        : "";
      return {
        modId: warning.modId,
        label: t(`modOrdering.dataCompatibility.warnings.${warning.kind}`),
        entry: {
          key: JSON.stringify([
            warning.sourceVpk,
            warning.filePath,
            warning.rowName,
            warning.fieldPath,
            warning.targetRow,
          ]),
          filePath: warning.filePath,
          context: [warning.rowName, warning.fieldPath].filter(Boolean),
          note: t(`modOrdering.dataCompatibility.reasons.${warning.reason}`),
          details: [target, warning.detail].filter(
            (detail, index, all) => detail && all.indexOf(detail) === index,
          ),
        },
      };
    }),
  ]);
  if (mods.length === 0) return null;
  if (embedded)
    return (
      <div className='space-y-3'>
        {mods.flatMap((mod) =>
          mod.groups.map((group) => (
            <div key={`${mod.modId}:${group.label}`}>
              <p className='font-medium text-xs'>{group.label}</p>
              <FindingEntries entries={group.entries} />
            </div>
          )),
        )}
      </div>
    );

  return (
    <Accordion className='rounded-md border' type='multiple'>
      {mods.map((mod) => (
        <AccordionItem
          className='px-3 last:border-b-0'
          key={mod.modId}
          value={mod.modId}>
          <AccordionTrigger className='gap-3 py-2.5 hover:no-underline'>
            <span className='min-w-0 flex-1 space-y-1'>
              <span className='flex items-baseline justify-between gap-3'>
                <span className='truncate'>
                  {modNames.get(mod.modId) ?? mod.modId}
                </span>
                <span className='shrink-0 font-normal text-muted-foreground text-xs tabular-nums'>
                  {t("modOrdering.compatibility.warningSummary", {
                    count: mod.count,
                  })}
                </span>
              </span>
              <span className='line-clamp-2 font-normal text-muted-foreground text-xs leading-relaxed'>
                {mod.groups.map((group) => group.label).join(", ")}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className='space-y-3'>
            {mod.groups.map((group) => (
              <div key={group.label}>
                <p className='font-medium text-xs'>
                  {group.label}
                  {group.entries.length > 1 ? (
                    <span className='ml-2 font-normal text-muted-foreground tabular-nums'>
                      {t("modOrdering.compatibility.affectedFiles", {
                        count: group.entries.length,
                      })}
                    </span>
                  ) : null}
                </p>
                <FindingEntries entries={group.entries} />
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

interface CompatibilityFixesProps {
  assetRepairs: readonly AssetRepair[];
  dataRepairs: readonly DataRepair[];
  modNames: ReadonlyMap<string, string>;
}

export function CompatibilityFixes({
  assetRepairs,
  dataRepairs,
  modNames,
}: CompatibilityFixesProps) {
  const { t } = useTranslation();
  const mods = groupFindingsByMod<FindingEntry>([
    ...assetRepairs.map((repair) => ({
      modId: repair.modId,
      label: t(`modOrdering.compatibility.repairs.${repair.kind}`),
      entry: {
        key: JSON.stringify([repair.sourceVpk, repair.filePath]),
        filePath: repair.filePath,
        context: [],
        details: [],
      },
    })),
    ...dataRepairs.map((repair) => ({
      modId: repair.modId,
      label: t(`modOrdering.dataCompatibility.repairs.${repair.kind}`),
      entry: {
        key: JSON.stringify([
          repair.sourceVpk,
          repair.filePath,
          repair.rowName,
          repair.detail,
        ]),
        filePath: repair.filePath,
        context: [repair.rowName].filter(Boolean),
        details: repair.detail ? [repair.detail] : [],
      },
    })),
  ]);
  if (mods.length === 0) return null;

  return (
    <ul className='space-y-1'>
      {mods.map((mod) => (
        <li key={mod.modId}>
          <CompatibilityModRow
            modId={mod.modId}
            name={modNames.get(mod.modId) ?? mod.modId}
            labels={[
              ...new Set(
                [...assetRepairs, ...dataRepairs]
                  .filter((repair) => repair.modId === mod.modId)
                  .map((repair) =>
                    t(`myMods.compatibility.repairLabels.${repair.kind}`),
                  ),
              ),
            ]}>
            <div className='mt-3 space-y-3'>
              {mod.groups.map((group) => (
                <div key={group.label}>
                  <p className='text-xs font-medium'>{group.label}</p>
                  <FindingEntries entries={group.entries} />
                </div>
              ))}
            </div>
          </CompatibilityModRow>
        </li>
      ))}
    </ul>
  );
}
