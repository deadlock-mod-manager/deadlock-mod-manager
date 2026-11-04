import { CopyCompatibilityFindings } from "./copy-compatibility-findings";
import { Wrench, ScanSearch, Info } from "@deadlock-mods/ui/icons";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@deadlock-mods/ui/components/tabs";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AnimationDependencyCheck } from "@/types/generated/AnimationDependencyCheck";
import type { HudCheck } from "@/types/generated/HudCheck";
import { CompatibilityModFindings } from "./compatibility-mod-findings";
import { AnimationDependencyReport } from "./animation-dependency-report";
import {
  BaselineCompatibilityReport,
  type CompiledDataBaseline,
} from "./baseline-compatibility-report";

import type { AssetRepair, AssetWarning } from "./asset-compatibility-report";
import { CompatibilityFixes } from "./compatibility-findings";
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
  error: string | null;
}

interface HeroIdReassignment {
  rowName: string;
  modId: string;
  requestedId: number;
  assignedId: number;
}

export interface LocalizationOverlayAnalysis {
  hudChecks: HudCheck[];
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
  animationChecks: AnimationDependencyCheck[];
  unloadedModels: string[];
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
  const unloadedModels = new Set(analysis.unloadedModels);
  const assetWarnings = analysis.assetWarnings.filter(
    (warning) => !unloadedModels.has(warning.filePath),
  );
  const repairCount =
    analysis.assetRepairs.length +
    analysis.dataRepairs.length +
    analysis.heroIdReassignments.length;
  const baselines = analysis.baselines ?? [];
  const hudLog = analysis.hudChecks[0]?.console;
  const animationChecks = analysis.animationChecks.filter(
    (check) => !unloadedModels.has(check.filePath),
  );
  const hasDetails = warningFiles > 0 || animationChecks.length > 0;
  return (
    <Tabs defaultValue='repairs' className='flex min-h-0 flex-1 flex-col'>
      <TabsList
        className='h-auto w-full shrink-0 justify-start gap-5 rounded-none border-b bg-transparent p-0'
        aria-label={t("myMods.compatibility.title")}>
        <TabsTrigger
          value='repairs'
          className='gap-2 rounded-none border-b-2 border-transparent px-1 py-3 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none'>
          <Wrench aria-hidden className='size-4' />
          {t("myMods.compatibility.repairsTab")}
        </TabsTrigger>
        <TabsTrigger
          value='findings'
          className='gap-2 rounded-none border-b-2 border-transparent px-1 py-3 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none'>
          <ScanSearch aria-hidden className='size-4' />
          {t("myMods.compatibility.findingsTab")}
        </TabsTrigger>
        <TabsTrigger
          value='coverage'
          className='gap-2 rounded-none border-b-2 border-transparent px-1 py-3 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none'>
          <Info aria-hidden className='size-4' />
          {t("myMods.compatibility.scanDetails")}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value='repairs'
        className='min-h-0 space-y-3 overflow-y-auto pr-2'>
        <p className='flex items-center gap-2 px-3 pt-2 font-medium text-sm'>
          <Wrench aria-hidden className='size-3.5 text-primary' />
          {repairCount > 0
            ? t("myMods.compatibility.repairsAvailable", { count: repairCount })
            : automaticChanges > 0
              ? t("myMods.compatibility.sharedChangesReady")
              : t("myMods.compatibility.noRepairs")}
        </p>
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
                          ? t(
                              "modOrdering.localization.dataFieldConflictLabel",
                              {
                                entry: entryLabel,
                                field: conflict.fieldPath,
                              },
                            )
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

        <CompatibilityFixes
          assetRepairs={analysis.assetRepairs}
          dataRepairs={analysis.dataRepairs}
          modNames={modNames}
        />
        {analysis.heroIdReassignments.length > 0 ||
        analysis.ignoredHistoricalTokens > 0 ||
        baselines.length > 0 ? (
          <details className='border-t py-3'>
            <summary className='cursor-pointer text-sm'>
              {t("myMods.compatibility.sharedDetails")}
            </summary>
            <div className='mt-3 space-y-4'>
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
                    {t("modOrdering.localization.oldTextProtectedDescription")}
                  </p>
                </section>
              ) : null}
              <BaselineCompatibilityReport
                baselines={baselines}
                modNames={modNames}
              />
            </div>
          </details>
        ) : null}
      </TabsContent>
      <TabsContent
        value='findings'
        className='min-h-0 space-y-3 overflow-y-auto pr-2'>
        <div className='flex flex-wrap items-start justify-between gap-2 pt-2'>
          <p className='max-w-[48ch] flex-1 text-muted-foreground text-sm'>
            {t("myMods.compatibility.findingsIntro")}
          </p>
          <CopyCompatibilityFindings analysis={analysis} modNames={modNames} />
        </div>
        {assetWarnings.length === 0 &&
        analysis.dataWarnings.length === 0 &&
        analysis.hudChecks.length === 0 &&
        analysis.inputWarnings.length === 0 &&
        analysis.unmanagedVpks.length === 0 &&
        analysis.protectedResources.length === 0 &&
        !hasDetails ? (
          <p className='text-sm'>{t("myMods.compatibility.noFindings")}</p>
        ) : null}
        <CompatibilityModFindings
          analysis={analysis}
          assetWarnings={assetWarnings}
          dataWarnings={analysis.dataWarnings}
          checks={analysis.hudChecks}
          modNames={modNames}
        />
      </TabsContent>
      <TabsContent
        value='coverage'
        className='min-h-0 space-y-5 overflow-y-auto pr-2 text-xs'>
        {automaticChanges > 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t("modOrdering.localization.automaticSummary", {
              count: automaticChanges,
            })}
          </p>
        ) : null}

        {analysis.hudChecks.length > 0 ? (
          <section className='space-y-2 pt-2'>
            <h3 className='font-medium text-sm'>
              {t("hudCompatibility.title")}
            </h3>
            <p>
              {t("hudCompatibility.summary", {
                count: analysis.hudChecks.length,
                unchanged: analysis.hudChecks.filter(
                  (check) =>
                    check.status === "compared" &&
                    check.missingPanels.length === 0 &&
                    check.console.lines.length === 0,
                ).length,
              })}
            </p>
            <p className='text-muted-foreground'>
              {t("hudCompatibility.advisory")}
            </p>
            {hudLog?.modifiedAt != null ? (
              <p className='text-muted-foreground'>
                {t("hudCompatibility.logModified", {
                  date: new Date(hudLog.modifiedAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {hudLog?.truncated ? (
              <p className='text-muted-foreground'>
                {t("hudCompatibility.logTruncated")}
              </p>
            ) : null}
            {hudLog?.error ? (
              <p className='break-all text-muted-foreground'>{hudLog.error}</p>
            ) : null}
            {analysis.hudChecks.some((check) => check.console.error) ? (
              <p className='text-muted-foreground'>
                {t("hudCompatibility.logUnavailable")}
              </p>
            ) : null}
          </section>
        ) : null}
        {hasDetails ? (
          <div className='space-y-5'>
            {warningFiles > 0 ? (
              <section className='space-y-3'>
                <h3 className='font-medium text-sm'>
                  {t("modOrdering.localization.advancedDetails", {
                    count: warningFiles,
                  })}
                </h3>
                <div className='space-y-4 text-xs'>
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
                              {t(
                                "modOrdering.localization.snapshotWarningItem",
                                {
                                  modName:
                                    modNames.get(warning.modId) ??
                                    warning.modId,
                                  changed: warning.changedTokens,
                                  total: warning.totalTokens,
                                },
                              )}
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
                              {warning.error
                                ? t("modOrdering.localization.parseErrorItem", {
                                    modName:
                                      modNames.get(warning.modId) ??
                                      warning.modId,
                                  })
                                : t(
                                    "modOrdering.localization.parseWarningItem",
                                    {
                                      modName:
                                        modNames.get(warning.modId) ??
                                        warning.modId,
                                      lines: warning.skippedLines.join(", "),
                                    },
                                  )}
                            </p>
                            <code className='mt-0.5 block break-all text-muted-foreground'>
                              {warning.filePath}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            <AnimationDependencyReport
              embedded
              checks={animationChecks}
              modNames={modNames}
            />
          </div>
        ) : null}
      </TabsContent>
    </Tabs>
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
