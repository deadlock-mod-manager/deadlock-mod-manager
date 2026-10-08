import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  CaretDownIcon,
  ProhibitIcon,
  ShieldWarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGuardedSections } from "@/hooks/performance/use-guarded-sections";
import { useStoredRequestOptions } from "@/hooks/performance/use-perf-config-list";
import {
  engineSectionEdits,
  entriesWithStatus,
  LEFT_OUT_STATUSES,
  UNREAD_STATUSES,
} from "@/lib/performance/resolved-summary";
import { usePersistedStore } from "@/lib/store";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import {
  DetailsSection,
  EntryKey,
  entryKey,
  useEntryReason,
} from "./details-parts";

const MAX_LISTED_SECTIONS = 3;

const NotAppliedCard = ({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className='flex gap-3 rounded-md border bg-muted/10 p-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0'>
    {icon}
    <div className='min-w-0 flex-1'>
      <div className='flex items-center justify-between gap-3'>
        <p className='font-medium text-sm'>{title}</p>
        {action}
      </div>
      <div className='mt-1 text-muted-foreground text-xs'>{children}</div>
    </div>
  </div>
);

const ViewToggle = () => {
  const { t } = useTranslation();
  return (
    <CollapsibleTrigger asChild>
      <Button
        className='group h-6 gap-1 px-1.5 text-xs'
        size='sm'
        variant='ghost'>
        {t("performance.details.notApplied.view")}
        <CaretDownIcon
          aria-hidden
          className='transition-transform group-data-[state=open]:rotate-180'
        />
      </Button>
    </CollapsibleTrigger>
  );
};

const EntryList = ({
  entries,
  detail,
}: {
  entries: ResolvedEntry[];
  detail: (entry: ResolvedEntry) => string;
}) => (
  <CollapsibleContent>
    <ul className='mt-2 max-h-64 overflow-y-auto pr-1'>
      {entries.map((entry) => (
        <li
          className='flex min-w-0 items-center gap-2 py-0.5 leading-5'
          key={entryKey(entry)}>
          <EntryKey className='shrink-0 text-foreground' entry={entry} />
          <span className='min-w-0 truncate' title={detail(entry)}>
            {detail(entry)}
          </span>
        </li>
      ))}
    </ul>
  </CollapsibleContent>
);

const EntryReasonList = ({
  title,
  icon,
  summary,
  entries,
}: {
  title: string;
  icon: ReactNode;
  summary: string;
  entries: ResolvedEntry[];
}) => {
  const reasonFor = useEntryReason();
  return (
    <Collapsible>
      <NotAppliedCard action={<ViewToggle />} icon={icon} title={title}>
        <p>{summary}</p>
        <EntryList detail={reasonFor} entries={entries} />
      </NotAppliedCard>
    </Collapsible>
  );
};

const EngineSectionsCard = ({
  configId,
  resolved,
}: {
  configId: string;
  resolved: ResolvedConfig;
}) => {
  const { t } = useTranslation();
  const { includeEngineSections: include } = useStoredRequestOptions(configId);
  const setInclude = usePersistedStore(
    (state) => state.setPerfIncludeEngineSections,
  );
  const { count, sections, edits } = engineSectionEdits(resolved.entries);
  const named = useGuardedSections(sections);
  if (count === 0) return null;

  const switchId = `include-engine-${configId}`;

  const change = (entry: ResolvedEntry) =>
    t("performance.details.engine.change", {
      from: entry.liveValue ?? t("performance.details.engine.notSet"),
      to: entry.value ?? t("performance.details.view.commentedOut"),
    });

  return (
    <Collapsible>
      <NotAppliedCard
        action={
          <div className='flex shrink-0 items-center gap-2'>
            <ViewToggle />
            <label
              className='flex items-center gap-2 text-muted-foreground text-xs'
              htmlFor={switchId}>
              <Switch
                checked={include}
                id={switchId}
                onCheckedChange={(checked) => setInclude(configId, checked)}
              />
              {t("performance.details.engine.include")}
            </label>
          </div>
        }
        icon={<ShieldWarningIcon aria-hidden className='text-amber-400' />}
        title={
          include
            ? t("performance.details.engine.titleIncluded", { count })
            : t("performance.details.engine.title", { count })
        }>
        <p>
          {sections.length > MAX_LISTED_SECTIONS
            ? t("performance.details.engine.sectionsMore", {
                sections: sections.slice(0, MAX_LISTED_SECTIONS).join(", "),
                count: sections.length - MAX_LISTED_SECTIONS,
              })
            : t("performance.details.engine.sections", {
                sections: sections.join(", "),
              })}{" "}
          {named.length > 0
            ? t("performance.details.engine.valveMessage", {
                sections: named.join(", "),
              })
            : t("performance.details.engine.outsideConvars")}
        </p>
        <EntryList detail={change} entries={edits} />
      </NotAppliedCard>
    </Collapsible>
  );
};

/** Engine-section edits, settings the game doesn't read, and lines we never write. */
export const NotApplied = ({
  configId,
  resolved,
}: {
  configId: string;
  resolved: ResolvedConfig;
}) => {
  const { t } = useTranslation();
  const unread = entriesWithStatus(resolved.entries, UNREAD_STATUSES);
  const leftOut = entriesWithStatus(resolved.entries, LEFT_OUT_STATUSES);
  const hasEngineEdits = engineSectionEdits(resolved.entries).count > 0;

  if (!hasEngineEdits && unread.length === 0 && leftOut.length === 0) {
    return null;
  }

  const { blocked, removed, notConvar } = resolved.counts;
  const unreadParts: string[] = [];
  if (blocked > 0) {
    unreadParts.push(
      t("performance.details.unread.blocked", { count: blocked }),
    );
  }
  if (removed > 0) {
    unreadParts.push(
      t("performance.details.unread.removed", { count: removed }),
    );
  }
  if (notConvar > 0) {
    unreadParts.push(
      t("performance.details.unread.notConvar", { count: notConvar }),
    );
  }

  return (
    <DetailsSection title={t("performance.details.notApplied.title")}>
      <EngineSectionsCard configId={configId} resolved={resolved} />
      {unread.length > 0 && (
        <EntryReasonList
          entries={unread}
          icon={<ProhibitIcon aria-hidden className='text-amber-400' />}
          summary={unreadParts.join(", ")}
          title={t("performance.details.unread.title", {
            count: unread.length,
          })}
        />
      )}
      {leftOut.length > 0 && (
        <EntryReasonList
          entries={leftOut}
          icon={<XCircleIcon aria-hidden className='text-muted-foreground' />}
          summary={t("performance.details.leftOut.summary")}
          title={t("performance.details.leftOut.title", {
            count: leftOut.length,
          })}
        />
      )}
    </DetailsSection>
  );
};
