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
import {
  CheckCircle2,
  Languages,
  TriangleAlert,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export interface LocalizationCandidate {
  modId: string;
  sourceVpk: string;
  value: string;
  priority: number;
}

export interface LocalizationConflict {
  key: string;
  filePath: string;
  token: string;
  vanillaValue: string | null;
  candidates: LocalizationCandidate[];
}

export interface CompiledDataCandidate {
  modId: string;
  sourceVpk: string;
  priority: number;
}

export interface CompiledDataConflict {
  key: string;
  filePath: string;
  rowName: string;
  fieldPath: string;
  existedInVanilla: boolean;
  candidates: CompiledDataCandidate[];
}

export interface LocalizationSnapshotWarning {
  modId: string;
  filePath: string;
  changedTokens: number;
  totalTokens: number;
}

export interface LocalizationParseWarning {
  modId: string;
  filePath: string;
  skippedLines: number[];
}

export interface HeroIdReassignment {
  rowName: string;
  modId: string;
  requestedId: number;
  assignedId: number;
}

export interface LocalizationOverlayAnalysis {
  scannedMods: number;
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
  modNames,
  onChoiceChange,
}: LocalizationConflictReviewProps) {
  const { t } = useTranslation();
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

  return (
    <div className='min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto pr-2'>
      <div className='space-y-3 rounded-md border bg-muted/25 px-4 py-3.5'>
        <div className='flex items-start gap-3'>
          <Languages className='mt-0.5 h-5 w-5 shrink-0 text-primary' />
          <p className='max-w-[68ch] text-sm leading-relaxed'>
            {t("modOrdering.localization.reviewDescription")}
          </p>
        </div>
        <div className='grid gap-2 pl-8 text-xs sm:grid-cols-2'>
          <div className='flex items-center gap-2 text-muted-foreground'>
            <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
            {t("modOrdering.localization.automaticSummary", {
              count: automaticChanges,
            })}
          </div>
          <div className='flex items-center gap-2 text-muted-foreground'>
            {conflictCount > 0 ? (
              <TriangleAlert className='h-4 w-4 shrink-0 text-amber-400' />
            ) : (
              <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
            )}
            {conflictCount > 0
              ? t("modOrdering.localization.choiceSummary", {
                  count: conflictCount,
                })
              : t("modOrdering.localization.noChoicesSummary")}
          </div>
        </div>
      </div>

      {analysis.ignoredHistoricalTokens > 0 ? (
        <section className='space-y-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3'>
          <div className='flex items-start gap-3'>
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
            <div>
              <p className='font-medium text-sm'>
                {t("modOrdering.localization.oldTextProtectedTitle", {
                  count: analysis.ignoredHistoricalTokens,
                })}
              </p>
              <p className='mt-1 max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
                {t("modOrdering.localization.oldTextProtectedDescription")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {analysis.heroIdReassignments.length > 0 ? (
        <section className='space-y-2 rounded-md border bg-muted/20 px-4 py-3'>
          <div className='flex items-start gap-3'>
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
            <div>
              <p className='font-medium text-sm'>
                {t("modOrdering.localization.heroIdsAdjustedTitle", {
                  count: analysis.heroIdReassignments.length,
                })}
              </p>
              <p className='mt-1 max-w-[68ch] text-muted-foreground text-xs leading-relaxed'>
                {t("modOrdering.localization.heroIdsAdjustedDescription")}
              </p>
            </div>
          </div>
          <ul className='space-y-1 pl-7 text-xs'>
            {analysis.heroIdReassignments.map((reassignment) => (
              <li
                className='flex flex-wrap items-baseline gap-x-2'
                key={`${reassignment.modId}:${reassignment.rowName}`}>
                <span className='font-medium'>{reassignment.rowName}</span>
                <span className='text-muted-foreground'>
                  {modNames.get(reassignment.modId) ?? reassignment.modId}
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

      <div className='space-y-3'>
        <div>
          <p className='font-medium text-sm'>
            {conflictCount > 0
              ? t("modOrdering.localization.conflictsTitle")
              : t("modOrdering.localization.readyTitle")}
          </p>
          <p className='mt-1 text-muted-foreground text-xs leading-relaxed'>
            {conflictCount > 0
              ? t("modOrdering.localization.conflictsDescription")
              : t("modOrdering.localization.noConflicts")}
          </p>
        </div>

        {analysis.conflicts.length === 0 &&
        analysis.compiledDataConflicts.length === 0 ? (
          <div className='flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm'>
            <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-500' />
            {t("modOrdering.localization.readyMessage")}
          </div>
        ) : null}
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
      </div>

      {warningFiles > 0 ? (
        <Accordion collapsible type='single'>
          <AccordionItem
            className='rounded-md border px-4'
            value='technical-details'>
            <AccordionTrigger className='py-3 hover:no-underline'>
              <span className='flex items-center gap-2 text-left'>
                <TriangleAlert className='h-4 w-4 shrink-0 text-amber-400' />
                {t("modOrdering.localization.advancedDetails", {
                  count: warningFiles,
                })}
              </span>
            </AccordionTrigger>
            <AccordionContent className='space-y-4 text-xs'>
              {analysis.snapshotWarnings.length > 0 ? (
                <div>
                  <p className='font-medium text-sm'>
                    {t("modOrdering.localization.snapshotWarningTitle")}
                  </p>
                  <p className='mt-1 max-w-[68ch] text-muted-foreground leading-relaxed'>
                    {t("modOrdering.localization.snapshotWarningDescription", {
                      count: analysis.snapshotWarnings.length,
                    })}
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
        </Accordion>
      ) : null}
    </div>
  );
}
