import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { CheckCircle2, TriangleAlert } from "@deadlock-mods/ui/icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BaselineCompatibilityReport,
  type CompiledDataBaseline,
} from "./baseline-compatibility-report";

import type { AssetRepair, AssetWarning } from "./asset-compatibility-report";
import {
  CompatibilityFixes,
  CompatibilityWarnings,
} from "./compatibility-findings";
import type { DataRepair, DataWarning } from "./data-compatibility-report";

interface LocalizationCandidate {
  modId: string;
  sourceVpk: string;
  value: string;
  priority: number;
}

interface LocalizationConflict {
  key: string;
  filePath: string;
  token: string;
  vanillaValue: string | null;
  candidates: LocalizationCandidate[];
}

interface CompiledDataCandidate {
  modId: string;
  sourceVpk: string;
  priority: number;
}

interface CompiledDataConflict {
  key: string;
  filePath: string;
  rowName: string;
  fieldPath: string;
  existedInVanilla: boolean;
  candidates: CompiledDataCandidate[];
}

interface LocalizationSnapshotWarning {
  modId: string;
  filePath: string;
  changedTokens: number;
  totalTokens: number;
}

interface LocalizationParseWarning {
  modId: string;
  filePath: string;
  skippedLines: number[];
}

interface HeroIdReassignment {
  rowName: string;
  modId: string;
  requestedId: number;
  assignedId: number;
}

export interface LocalizationOverlayAnalysis {
  baselines: CompiledDataBaseline[];
  reviewFingerprint: string;
  inputWarnings: { modId: string; filePaths: string[] }[];
  unmanagedVpks: { modId: string; filePath: string }[];
  scannedMods: number;
  compatibilityModIds: string[];
  excludedModIds: string[];
  protectedResources: { filePath: string; modIds: string[] }[];
  scannedVpks: number;
  localizationFiles: number;
  ignoredVanillaTokens: number;
  ignoredHistoricalTokens: number;
  changedTokens: number;
  newTokens: number;
  conflicts: LocalizationConflict[];
  compiledDataFiles: number;
  ignoredVanillaRows: number;
  changedRows: number;
  newRows: number;
  compiledDataConflicts: CompiledDataConflict[];
  heroIdReassignments: HeroIdReassignment[];
  snapshotWarnings: LocalizationSnapshotWarning[];
  parseWarnings: LocalizationParseWarning[];
  assetRepairs: AssetRepair[];
  assetWarnings: AssetWarning[];
  dataRepairs: DataRepair[];
  dataWarnings: DataWarning[];
}

export type LocalizationChoice =
  | "load-order"
  | "vanilla"
  | `candidate:${number}`;

interface LocalizationConflictReviewProps {
  analysis: LocalizationOverlayAnalysis;
  choices: Readonly<Record<string, LocalizationChoice>>;
  modNames: ReadonlyMap<string, string>;
  onChoiceChange: (conflictKey: string, choice: LocalizationChoice) => void;
}

export function LocalizationConflictReview({
  analysis,
  choices,
  modNames: managedModNames,
  onChoiceChange,
}: LocalizationConflictReviewProps) {
  const { t } = useTranslation();
  const modNames = new Map(managedModNames);
  for (const archive of analysis.unmanagedVpks) {
    modNames.set(archive.modId, archive.filePath);
  }
  const conflictCount =
    analysis.conflicts.length + analysis.compiledDataConflicts.length;
  const detectedChanges =
    analysis.changedTokens +
    analysis.newTokens +
    analysis.changedRows +
    analysis.newRows;
  const automaticChanges = Math.max(0, detectedChanges - conflictCount);
  const warningFiles = new Set(
    [...analysis.snapshotWarnings, ...analysis.parseWarnings].map(
      (warning) => `${warning.modId}:${warning.filePath}`,
    ),
  ).size;
  const warningCount =
    analysis.assetWarnings.length +
    analysis.dataWarnings.length +
    analysis.unmanagedVpks.length +
    analysis.inputWarnings.length +
    analysis.protectedResources.length;
  const repairCount =
    analysis.assetRepairs.length +
    analysis.dataRepairs.length +
    analysis.heroIdReassignments.length;
  const baselines = analysis.baselines ?? [];
  const hasAutomaticDetails =
    repairCount > 0 ||
    automaticChanges > 0 ||
    analysis.ignoredHistoricalTokens > 0 ||
    baselines.length > 0;

  return (
    <div className='min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto pr-2'>
      <div className='flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm'>
        <ReviewStat warn={conflictCount > 0}>
          {conflictCount > 0
            ? t("modOrdering.localization.choiceSummary", {
                count: conflictCount,
              })
            : t("modOrdering.localization.noChoicesSummary")}
        </ReviewStat>
        {warningCount > 0 ? (
          <ReviewStat warn>
            {t("modOrdering.compatibility.warningSummary", {
              count: warningCount,
            })}
          </ReviewStat>
        ) : null}
        {repairCount > 0 ? (
          <ReviewStat>
            {t("modOrdering.compatibility.repairSummary", {
              count: repairCount,
            })}
          </ReviewStat>
        ) : null}
        {automaticChanges > 0 ? (
          <ReviewStat>
            {t("modOrdering.localization.automaticSummary", {
              count: automaticChanges,
            })}
          </ReviewStat>
        ) : null}
      </div>

      {conflictCount === 0 && warningCount === 0 ? (
        <div className='flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm'>
          <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
          {t("modOrdering.localization.readyMessage")}
        </div>
      ) : null}

      {conflictCount > 0 ? (
        <ReviewSection
          description={t("modOrdering.localization.conflictsDescription")}
          title={t("modOrdering.localization.conflictsTitle")}>
          {analysis.conflicts.map((conflict) => {
            const selected = choices[conflict.key] ?? "load-order";
            const firstCandidate = conflict.candidates[0];
            const firstModName = firstCandidate
              ? (modNames.get(firstCandidate.modId) ?? firstCandidate.modId)
              : t("modOrdering.localization.unknownMod");

            return (
              <section
                className='space-y-3 rounded-md border bg-background px-4 py-3'
                key={conflict.key}>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='break-all font-medium text-sm'>
                      {t("modOrdering.localization.textConflictLabel", {
                        token: conflict.token,
                      })}
                    </p>
                  </div>
                  <Badge className='shrink-0' variant='outline'>
                    {t("modOrdering.localization.gameText")}
                  </Badge>
                </div>

                <Select
                  value={selected}
                  onValueChange={(value: LocalizationChoice) =>
                    onChoiceChange(conflict.key, value)
                  }>
                  <SelectTrigger
                    aria-label={t("modOrdering.localization.chooseWinner", {
                      token: conflict.token,
                    })}
                    className='h-auto min-h-9 normal-case'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='load-order'>
                      {t("modOrdering.localization.useLoadOrder", {
                        modName: firstModName,
                      })}
                    </SelectItem>
                    {conflict.candidates.map((candidate, index) => (
                      <SelectItem
                        key={`${candidate.modId}:${candidate.priority}:${candidate.sourceVpk}:${candidate.value}`}
                        value={`candidate:${index}`}>
                        {t("modOrdering.localization.chooseModValue", {
                          modName:
                            modNames.get(candidate.modId) ?? candidate.modId,
                          value: candidate.value,
                        })}
                      </SelectItem>
                    ))}
                    <SelectItem value='vanilla'>
                      {conflict.vanillaValue === null
                        ? t("modOrdering.localization.doNotAdd")
                        : t("modOrdering.localization.keepVanilla", {
                            value: conflict.vanillaValue,
                          })}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className='grid gap-1.5 text-xs'>
                  {conflict.candidates.map((candidate) => (
                    <div
                      className='grid grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)] gap-3 text-muted-foreground'
                      key={`${candidate.modId}:${candidate.priority}:${candidate.sourceVpk}:${candidate.value}`}>
                      <span className='truncate'>
                        {modNames.get(candidate.modId) ?? candidate.modId}
                      </span>
                      <span className='break-words text-foreground'>
                        {candidate.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {analysis.compiledDataConflicts.map((conflict) => {
            const selected = choices[conflict.key] ?? "load-order";
            const firstCandidate = conflict.candidates[0];
            const firstModName = firstCandidate
              ? (modNames.get(firstCandidate.modId) ?? firstCandidate.modId)
              : t("modOrdering.localization.unknownMod");
            const entryLabel = conflict.filePath.endsWith("/heroes.vdata_c")
              ? t("modOrdering.localization.heroConflictLabel", {
                  row: conflict.rowName,
                })
              : conflict.filePath.endsWith("/abilities.vdata_c")
                ? t("modOrdering.localization.abilityConflictLabel", {
                    row: conflict.rowName,
                  })
                : conflict.filePath.endsWith("/bot_difficulty.vdata_c")
                  ? t("modOrdering.localization.botConflictLabel", {
                      row: conflict.rowName,
                    })
                  : t("modOrdering.localization.dataConflictLabel", {
                      row: conflict.rowName,
                    });

            return (
              <section
                className='space-y-3 rounded-md border bg-background px-4 py-3'
                key={conflict.key}>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='break-all font-medium text-sm'>
                      {conflict.fieldPath
                        ? t("modOrdering.localization.dataFieldConflictLabel", {
                            entry: entryLabel,
                            field: conflict.fieldPath,
                          })
                        : entryLabel}
                    </p>
                  </div>
                  <Badge className='shrink-0' variant='outline'>
                    {t("modOrdering.localization.gameData")}
                  </Badge>
                </div>

                <Select
                  value={selected}
                  onValueChange={(value: LocalizationChoice) =>
                    onChoiceChange(conflict.key, value)
                  }>
                  <SelectTrigger
                    aria-label={t(
                      "modOrdering.localization.chooseCompiledWinner",
                      { row: conflict.rowName },
                    )}
                    className='h-auto min-h-9 normal-case'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='load-order'>
                      {t("modOrdering.localization.useLoadOrder", {
                        modName: firstModName,
                      })}
                    </SelectItem>
                    {conflict.candidates.map((candidate, index) => (
                      <SelectItem
                        key={`${candidate.modId}:${candidate.priority}:${candidate.sourceVpk}`}
                        value={`candidate:${index}`}>
                        {modNames.get(candidate.modId) ?? candidate.modId}
                      </SelectItem>
                    ))}
                    <SelectItem value='vanilla'>
                      {conflict.existedInVanilla
                        ? t("modOrdering.localization.keepCompiledVanilla")
                        : t("modOrdering.localization.doNotAddCompiled")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </section>
            );
          })}
        </ReviewSection>
      ) : null}

      {warningCount > 0 ? (
        <ReviewSection
          description={t("modOrdering.compatibility.warningDescription")}
          title={t("modOrdering.compatibility.warningsTitle")}>
          {analysis.unmanagedVpks.length > 0 ? (
            <ReviewNotice
              description={t("myMods.compatibility.unmanagedFilesDescription")}
              title={t("myMods.compatibility.unmanagedFilesTitle")}>
              {analysis.unmanagedVpks.map((archive) => (
                <li className='break-all font-mono' key={archive.modId}>
                  {archive.filePath}
                </li>
              ))}
            </ReviewNotice>
          ) : null}
          {analysis.inputWarnings.length > 0 ? (
            <ReviewNotice
              description={t("myMods.compatibility.missingFilesDescription")}
              title={t("myMods.compatibility.missingFilesTitle")}>
              {analysis.inputWarnings.map((warning) => (
                <li key={warning.modId}>
                  <p className='text-foreground'>
                    {modNames.get(warning.modId) ?? warning.modId}
                  </p>
                  {warning.filePaths.map((path) => (
                    <p className='break-all font-mono' key={path}>
                      {path}
                    </p>
                  ))}
                </li>
              ))}
            </ReviewNotice>
          ) : null}
          {analysis.protectedResources.length > 0 ? (
            <ReviewNotice
              description={t("myMods.compatibility.sharedDescription")}
              title={t("myMods.compatibility.sharedTitle")}>
              {analysis.protectedResources.map((resource) => (
                <li key={resource.filePath}>
                  <p className='break-all font-mono'>{resource.filePath}</p>
                  <p>
                    {resource.modIds
                      .map((id) => modNames.get(id) ?? id)
                      .join(", ")}
                  </p>
                </li>
              ))}
            </ReviewNotice>
          ) : null}
          <CompatibilityWarnings
            assetWarnings={analysis.assetWarnings}
            dataWarnings={analysis.dataWarnings}
            modNames={modNames}
          />
        </ReviewSection>
      ) : null}

      {analysis.excludedModIds.length > 0 ? (
        <p className='text-muted-foreground text-xs'>
          {t("myMods.compatibility.excluded", {
            names: analysis.excludedModIds
              .map((id) => modNames.get(id) ?? id)
              .join(", "),
          })}
        </p>
      ) : null}

      {hasAutomaticDetails || warningFiles > 0 ? (
        <Accordion className='rounded-md border' type='multiple'>
          {hasAutomaticDetails ? (
            <AccordionItem className='px-3 last:border-b-0' value='automatic'>
              <AccordionTrigger className='py-2.5 hover:no-underline'>
                <span className='flex items-center gap-2.5 text-left'>
                  <CheckCircle2 className='size-4 shrink-0 text-emerald-500' />
                  {t("modOrdering.compatibility.automaticTitle")}
                </span>
              </AccordionTrigger>
              <AccordionContent className='space-y-5 pl-6.5'>
                <p className='max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
                  {t("modOrdering.localization.reviewDescription")}
                </p>
                <CompatibilityFixes
                  assetRepairs={analysis.assetRepairs}
                  dataRepairs={analysis.dataRepairs}
                  modNames={modNames}
                />
                {analysis.heroIdReassignments.length > 0 ? (
                  <section className='space-y-1.5'>
                    <p className='font-medium text-sm'>
                      {t("modOrdering.localization.heroIdsAdjustedTitle", {
                        count: analysis.heroIdReassignments.length,
                      })}
                    </p>
                    <p className='max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
                      {t("modOrdering.localization.heroIdsAdjustedDescription")}
                    </p>
                    <ul className='space-y-1 text-xs'>
                      {analysis.heroIdReassignments.map((reassignment) => (
                        <li
                          className='flex flex-wrap items-baseline gap-x-2'
                          key={`${reassignment.modId}:${reassignment.rowName}`}>
                          <span className='font-medium'>
                            {reassignment.rowName}
                          </span>
                          <span className='text-muted-foreground'>
                            {modNames.get(reassignment.modId) ??
                              reassignment.modId}
                          </span>
                          <span className='tabular-nums'>
                            {t("modOrdering.localization.heroIdChanged", {
                              requested: reassignment.requestedId,
                              assigned: reassignment.assignedId,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {analysis.ignoredHistoricalTokens > 0 ? (
                  <section className='space-y-1'>
                    <p className='font-medium text-sm'>
                      {t("modOrdering.localization.oldTextProtectedTitle", {
                        count: analysis.ignoredHistoricalTokens,
                      })}
                    </p>
                    <p className='max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
                      {t(
                        "modOrdering.localization.oldTextProtectedDescription",
                      )}
                    </p>
                  </section>
                ) : null}
                <BaselineCompatibilityReport
                  baselines={baselines}
                  modNames={modNames}
                />
              </AccordionContent>
            </AccordionItem>
          ) : null}
          {warningFiles > 0 ? (
            <AccordionItem
              className='px-3 last:border-b-0'
              value='technical-details'>
              <AccordionTrigger className='py-2.5 hover:no-underline'>
                <span className='flex items-center gap-2.5 text-left'>
                  <TriangleAlert className='size-4 shrink-0 text-amber-400' />
                  {t("modOrdering.localization.advancedDetails", {
                    count: warningFiles,
                  })}
                </span>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pl-6.5 text-xs'>
                {analysis.snapshotWarnings.length > 0 ? (
                  <div>
                    <p className='font-medium text-sm'>
                      {t("modOrdering.localization.snapshotWarningTitle")}
                    </p>
                    <p className='mt-1 max-w-[68ch] text-muted-foreground leading-relaxed'>
                      {t(
                        "modOrdering.localization.snapshotWarningDescription",
                        { count: analysis.snapshotWarnings.length },
                      )}
                    </p>
                    <ul className='mt-2 space-y-2'>
                      {analysis.snapshotWarnings.map((warning) => (
                        <li key={`${warning.modId}:${warning.filePath}`}>
                          <p>
                            {t("modOrdering.localization.snapshotWarningItem", {
                              modName:
                                modNames.get(warning.modId) ?? warning.modId,
                              changed: warning.changedTokens,
                              total: warning.totalTokens,
                            })}
                          </p>
                          <code className='mt-0.5 block break-all text-muted-foreground'>
                            {warning.filePath}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {analysis.parseWarnings.length > 0 ? (
                  <div>
                    <p className='font-medium text-sm'>
                      {t("modOrdering.localization.parseWarningTitle")}
                    </p>
                    <p className='mt-1 max-w-[68ch] text-muted-foreground leading-relaxed'>
                      {t("modOrdering.localization.parseWarningDescription")}
                    </p>
                    <ul className='mt-2 space-y-2'>
                      {analysis.parseWarnings.map((warning) => (
                        <li key={`${warning.modId}:${warning.filePath}`}>
                          <p>
                            {t("modOrdering.localization.parseWarningItem", {
                              modName:
                                modNames.get(warning.modId) ?? warning.modId,
                              lines: warning.skippedLines.join(", "),
                            })}
                          </p>
                          <code className='mt-0.5 block break-all text-muted-foreground'>
                            {warning.filePath}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      ) : null}
    </div>
  );
}

function ReviewStat({
  warn = false,
  children,
}: {
  warn?: boolean;
  children: ReactNode;
}) {
  const Icon = warn ? TriangleAlert : CheckCircle2;
  return (
    <span className='flex items-center gap-1.5'>
      <Icon
        aria-hidden
        className={warn ? "size-4 text-amber-400" : "size-4 text-emerald-500"}
      />
      {children}
    </span>
  );
}

function ReviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className='space-y-3'>
      <div>
        <h3 className='font-medium text-sm'>{title}</h3>
        <p className='mt-1 max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function ReviewNotice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className='space-y-1.5 rounded-md border border-amber-500/30 px-3 py-2.5 text-xs'>
      <p className='flex items-center gap-2 font-medium text-sm'>
        <TriangleAlert aria-hidden className='size-4 shrink-0 text-amber-400' />
        {title}
      </p>
      <p className='max-w-[68ch] pl-6 text-muted-foreground leading-relaxed'>
        {description}
      </p>
      <ul className='space-y-1.5 pl-6 text-muted-foreground'>{children}</ul>
    </div>
  );
}
