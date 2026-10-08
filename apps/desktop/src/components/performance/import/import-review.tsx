import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  CheckCircleIcon,
  EyeIcon,
  FunnelSimpleIcon,
  MonitorIcon,
  ProhibitIcon,
  QuestionIcon,
  ShieldWarningIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGuardedSections } from "@/hooks/performance/use-guarded-sections";
import {
  commonSinceBuild,
  entryDisplayName,
  groupReviewEntries,
  summarizeSections,
} from "@/lib/performance/import/review";
import type { IgnoredKind } from "@/types/generated/IgnoredKind";
import type { IgnoredPart } from "@/types/generated/IgnoredPart";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import {
  EntryList,
  EntryReason,
  EntryValue,
  ReviewSection,
} from "./review-section";

const WILL_APPLY_PREVIEW = 6;

type ImportReviewProps = {
  report: ImportReport;
  /** The report's entries resolved with the user's choices in this dialog. */
  resolved: ResolvedConfig;
  cameraIncluded: boolean;
  onCameraIncludedChange: (included: boolean) => void;
  includeEngineSections: boolean;
  onIncludeEngineSectionsChange: (include: boolean) => void;
};

const Tile = ({
  icon,
  count,
  label,
}: {
  icon: ReactNode;
  count: number;
  label: string;
}) => (
  <div className='rounded-md border bg-card/40 px-3 py-2.5'>
    <div className='flex items-center gap-2'>
      {icon}
      <span className='font-semibold text-xl tabular-nums'>{count}</span>
    </div>
    <p className='mt-0.5 truncate text-muted-foreground text-xs' title={label}>
      {label}
    </p>
  </div>
);

const firstName = (entries: ResolvedEntry[]) =>
  entries[0] ? entryDisplayName(entries[0].path) : "";

const WontApplySummary = ({
  blocked,
  removed,
  refused,
}: {
  blocked: ResolvedEntry[];
  removed: ResolvedEntry[];
  refused: ResolvedEntry[];
}) => {
  const { t } = useTranslation();
  const build = commonSinceBuild(blocked);
  const sentences = [
    blocked.length > 0 &&
      (build === null
        ? t("performance.import.review.wontApply.blocked", {
            count: blocked.length,
            example: firstName(blocked),
          })
        : t("performance.import.review.wontApply.blockedSince", {
            count: blocked.length,
            build,
            example: firstName(blocked),
          })),
    removed.length > 0 &&
      t("performance.import.review.wontApply.removed", {
        count: removed.length,
        example: firstName(removed),
      }),
    refused.length > 0 &&
      t("performance.import.review.wontApply.refused", {
        count: refused.length,
      }),
  ].filter(Boolean);
  return <>{sentences.join(" ")}</>;
};

const IGNORED_ORDER: IgnoredKind[] = [
  "searchPaths",
  "modManagerMarkers",
  "listSection",
  "rootKey",
  "editorSection",
  "machineSpecific",
  "bind",
  "alias",
  "exec",
  "consoleCommand",
  "duplicateKey",
  "parseError",
];

const IgnoredParts = ({
  ignored,
  excluded,
}: {
  ignored: IgnoredPart[];
  excluded: ResolvedEntry[];
}) => {
  const { t } = useTranslation();
  const byKind = IGNORED_ORDER.map((kind) => ({
    kind,
    parts: ignored.filter((part) => part.kind === kind),
  })).filter((group) => group.parts.length > 0);

  return (
    <ul className='divide-y divide-border/60 text-xs'>
      {byKind.map(({ kind, parts }) => (
        <li className='px-3 py-2' key={kind}>
          <div className='flex items-baseline justify-between gap-4'>
            <span className='font-medium'>
              {t(`performance.import.review.ignored.kinds.${kind}`)}
            </span>
            <span className='font-mono text-muted-foreground tabular-nums'>
              {parts.length}
            </span>
          </div>
          <p className='mt-1 break-words font-mono text-muted-foreground'>
            {parts
              .map((part) =>
                part.line === null
                  ? part.detail
                  : t("performance.import.review.ignored.atLine", {
                      detail: part.detail,
                      line: part.line,
                    }),
              )
              .join(", ")}
          </p>
        </li>
      ))}
      {excluded.length > 0 && (
        <li className='px-3 py-2'>
          <div className='flex items-baseline justify-between gap-4'>
            <span className='font-medium'>
              {t("performance.import.review.ignored.neverWritten")}
            </span>
            <span className='font-mono text-muted-foreground tabular-nums'>
              {excluded.length}
            </span>
          </div>
          <p className='mt-1 break-words font-mono text-muted-foreground'>
            {excluded.map((entry) => entryDisplayName(entry.path)).join(", ")}
          </p>
        </li>
      )}
    </ul>
  );
};

export const ImportReview = ({
  report,
  resolved,
  cameraIncluded,
  onCameraIncludedChange,
  includeEngineSections,
  onIncludeEngineSectionsChange,
}: ImportReviewProps) => {
  const { t } = useTranslation();
  const groups = groupReviewEntries(resolved.entries);
  const wontApplyCount =
    groups.blocked.length + groups.removed.length + groups.refused.length;
  const sections = summarizeSections(groups.engineSections);
  const sectionList =
    sections.rest > 0
      ? t("performance.import.review.engine.sectionsWithRest", {
          sections: sections.shown.join(", "),
          count: sections.rest,
        })
      : sections.shown.join(", ");
  const ignoredCount = report.ignored.length + groups.excluded.length;
  const guardedSections = useGuardedSections(
    summarizeSections(groups.engineSections, Number.POSITIVE_INFINITY).shown,
  );
  const engineDescription = t("performance.import.review.engine.description", {
    count: groups.engineSections.length,
    sections: sectionList,
  });

  return (
    <div className='flex flex-col gap-3'>
      <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
        <Tile
          count={resolved.counts.applies}
          icon={
            <CheckCircleIcon
              className='size-4 text-emerald-500'
              weight='bold'
            />
          }
          label={t("performance.import.review.tiles.applies")}
        />
        <Tile
          count={groups.blocked.length}
          icon={
            <ProhibitIcon className='size-4 text-amber-500' weight='bold' />
          }
          label={t("performance.import.review.tiles.blocked")}
        />
        <Tile
          count={groups.removed.length}
          icon={
            <QuestionIcon className='size-4 text-amber-500' weight='bold' />
          }
          label={t("performance.import.review.tiles.notInBuild")}
        />
        <Tile
          count={groups.engineSections.length}
          icon={
            <ShieldWarningIcon
              className='size-4 text-destructive'
              weight='bold'
            />
          }
          label={
            includeEngineSections
              ? t("performance.import.review.tiles.engineIncluded")
              : t("performance.import.review.tiles.engineLeftOut")
          }
        />
      </div>

      {report.warnings.length > 0 && (
        <div className='flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs'>
          <WarningIcon
            className='mt-0.5 size-4 shrink-0 text-amber-500'
            weight='bold'
          />
          <ul className='flex flex-col gap-1'>
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {groups.willApply.length > 0 && (
        <ReviewSection
          count={groups.willApply.length}
          defaultOpen
          icon={
            <CheckCircleIcon
              className='size-4 text-emerald-500'
              weight='bold'
            />
          }
          title={t("performance.import.review.willApply.title")}>
          <EntryList
            entries={groups.willApply}
            footer={
              <span>
                {groups.alreadySet.length > 0 &&
                  `${t("performance.import.review.willApply.alreadySet", {
                    count: groups.alreadySet.length,
                  })} `}
                {groups.willApply.length > WILL_APPLY_PREVIEW &&
                  t("performance.import.review.willApply.editorHint")}
              </span>
            }
            limit={WILL_APPLY_PREVIEW}
          />
        </ReviewSection>
      )}

      {groups.cameraVisibility.length > 0 && (
        <ReviewSection
          action={
            <label className='flex items-center gap-2 text-muted-foreground text-xs'>
              <Switch
                checked={cameraIncluded}
                onCheckedChange={onCameraIncludedChange}
              />
              {t("performance.import.review.camera.included")}
            </label>
          }
          count={groups.cameraVisibility.length}
          defaultOpen
          icon={<EyeIcon className='size-4 text-sky-400' weight='bold' />}
          summary={t("performance.import.review.camera.description")}
          title={t("performance.import.review.camera.title")}>
          <EntryList
            entries={groups.cameraVisibility}
            renderDetail={(entry) =>
              cameraIncluded ? (
                <EntryValue entry={entry} />
              ) : (
                <span className='shrink-0 text-muted-foreground'>
                  {t("performance.status.omitted")}
                </span>
              )
            }
          />
        </ReviewSection>
      )}

      {wontApplyCount > 0 && (
        <ReviewSection
          count={wontApplyCount}
          icon={
            <ProhibitIcon className='size-4 text-amber-500' weight='bold' />
          }
          summary={
            <WontApplySummary
              blocked={groups.blocked}
              refused={groups.refused}
              removed={groups.removed}
            />
          }
          title={t("performance.import.review.wontApply.title")}>
          <EntryList
            entries={[...groups.blocked, ...groups.removed, ...groups.refused]}
            renderDetail={(entry) => <EntryReason entry={entry} />}
          />
        </ReviewSection>
      )}

      {groups.engineSections.length > 0 && (
        <ReviewSection
          action={
            <label className='flex items-center gap-2 text-muted-foreground text-xs'>
              <Switch
                checked={includeEngineSections}
                onCheckedChange={onIncludeEngineSectionsChange}
              />
              {t("performance.import.review.engine.include")}
            </label>
          }
          count={groups.engineSections.length}
          icon={
            <ShieldWarningIcon
              className='size-4 text-destructive'
              weight='bold'
            />
          }
          summary={
            guardedSections.length > 0
              ? `${engineDescription} ${t("performance.import.review.engine.valveMessage", { sections: guardedSections.join(", ") })}`
              : engineDescription
          }
          title={
            includeEngineSections
              ? t("performance.import.review.engine.titleIncluded")
              : t("performance.import.review.engine.title")
          }>
          <EntryList entries={groups.engineSections} />
        </ReviewSection>
      )}

      {groups.devtools.length > 0 && (
        <ReviewSection
          count={groups.devtools.length}
          icon={
            <WrenchIcon
              className='size-4 text-muted-foreground'
              weight='bold'
            />
          }
          summary={t("performance.import.review.devtools.description", {
            count: groups.devtools.length,
          })}
          title={t("performance.import.review.devtools.title")}>
          <EntryList entries={groups.devtools} />
        </ReviewSection>
      )}

      {ignoredCount > 0 && (
        <ReviewSection
          count={ignoredCount}
          icon={
            <FunnelSimpleIcon
              className='size-4 text-muted-foreground'
              weight='bold'
            />
          }
          summary={t("performance.import.review.ignored.description")}
          title={t("performance.import.review.ignored.title")}>
          <IgnoredParts excluded={groups.excluded} ignored={report.ignored} />
        </ReviewSection>
      )}

      {report.videoSettings.length > 0 && (
        <ReviewSection
          count={report.videoSettings.length}
          icon={
            <MonitorIcon
              className='size-4 text-muted-foreground'
              weight='bold'
            />
          }
          summary={t("performance.import.review.video.description")}
          title={t("performance.import.review.video.title")}>
          <ul className='divide-y divide-border/60 text-xs'>
            {report.videoSettings.map((setting) => (
              <li
                className='flex items-baseline justify-between gap-4 px-3 py-1.5'
                key={setting.key}>
                <span
                  className={setting.label ? undefined : "font-mono"}
                  title={setting.key}>
                  {setting.label ?? setting.key}
                </span>
                <span className='font-mono'>
                  {setting.display ?? setting.value}
                </span>
              </li>
            ))}
          </ul>
        </ReviewSection>
      )}
    </div>
  );
};
