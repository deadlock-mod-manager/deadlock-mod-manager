import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  ChevronDown,
  CircleCheck,
  Loader2,
  RotateCcw,
} from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useConflictIgnore,
  useMakeConflictWinner,
  useProfileConflicts,
} from "@/hooks/use-profile-conflicts";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import type { ModConflict } from "@/types/generated/ModConflict";
import type { LocalMod } from "@/types/mods";
import { ConflictGroupRow, modDisplayName } from "./conflict-group-row";
import { LoadOrderHelp } from "./load-order-help";

const IgnoredRow = ({
  label,
  onRestore,
  disabled,
  testId,
}: {
  label: React.ReactNode;
  onRestore?: () => void;
  disabled: boolean;
  testId?: string;
}) => {
  const { t } = useTranslation();
  return (
    <li
      className='flex min-h-9 items-center gap-3 px-3 py-1'
      data-testid={testId}>
      <div className='min-w-0 flex-1 truncate text-sm'>{label}</div>
      {onRestore && (
        <Button
          disabled={disabled}
          icon={<RotateCcw className='h-3.5 w-3.5' />}
          onClick={onRestore}
          size='sm'
          variant='ghost'>
          {t("conflicts.restore")}
        </Button>
      )}
    </li>
  );
};

const IgnoredSection = ({
  ignored,
  ignoredMods,
  modsById,
}: {
  ignored: ModConflict[];
  ignoredMods: string[];
  modsById: ReadonlyMap<string, LocalMod>;
}) => {
  const { t } = useTranslation();
  const ignore = useConflictIgnore();
  const total = ignored.length + ignoredMods.length;
  if (total === 0) {
    return null;
  }

  return (
    <Collapsible className='mt-2'>
      <div className='flex items-center justify-between'>
        <CollapsibleTrigger className='group flex items-center gap-1.5 rounded-sm text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60'>
          <ChevronDown
            aria-hidden
            className='h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90'
          />
          {t("conflicts.ignoredSection", { count: total })}
        </CollapsibleTrigger>
        <Button
          disabled={ignore.isPending}
          onClick={() => ignore.mutate([{ type: "clearAll" }])}
          size='sm'
          variant='ghost'>
          {t("conflicts.clearIgnores")}
        </Button>
      </div>
      <CollapsibleContent>
        <ul className='mt-2 divide-y rounded-lg border'>
          {ignored.map((conflict) => (
            <IgnoredRow
              disabled={ignore.isPending}
              key={`${conflict.winner}::${conflict.loser}`}
              label={t("conflicts.ignoredPair", {
                first: modDisplayName(modsById, conflict.winner),
                second: modDisplayName(modsById, conflict.loser),
              })}
              onRestore={
                conflict.ignoreReason === "mod"
                  ? undefined
                  : () =>
                      ignore.mutate([
                        {
                          type: "unignorePair",
                          modA: conflict.winner,
                          modB: conflict.loser,
                        },
                      ])
              }
              testId='ignored-conflict'
            />
          ))}
          {ignoredMods.map((modId) => (
            <IgnoredRow
              disabled={ignore.isPending}
              key={modId}
              label={t("conflicts.ignoredModRow", {
                mod: modDisplayName(modsById, modId),
              })}
              onRestore={() => ignore.mutate([{ type: "unignoreMod", modId }])}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * `visibleModIds` holds the mods left by the library's search and filters; an
 * overlap stays listed while any of its mods is visible.
 */
export const ConflictsPanel = ({
  visibleModIds,
}: {
  visibleModIds: ReadonlySet<string>;
}) => {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  const localMods = usePersistedStore((state) => state.localMods);
  const modsById = useMemo(
    () => new Map(localMods.map((mod) => [mod.remoteId, mod])),
    [localMods],
  );
  const { data, groups, isLoading, error } = useProfileConflicts();
  const ignore = useConflictIgnore();
  const makeWinner = useMakeConflictWinner();
  const isBusy = ignore.isPending || makeWinner.isPending;

  const visibleGroups = useMemo(
    () =>
      groups.filter((group) =>
        group.providers.some((modId) => visibleModIds.has(modId)),
      ),
    [groups, visibleModIds],
  );
  const hiddenModels = groups.filter(
    (group) => group.severity === "critical",
  ).length;

  let summary = t("conflicts.summaryNone");
  if (groups.length > 0) {
    summary = t("conflicts.summary", { count: groups.length });
  }
  if (hiddenModels > 0) {
    const key =
      hiddenModels === groups.length
        ? "conflicts.summaryModelsAll"
        : "conflicts.summaryModels";
    summary += ` ${t(key, { count: hiddenModels })}`;
  }

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className='flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t("conflicts.scanning")}
      </div>
    );
  } else if (error) {
    body = (
      <p className='py-12 text-center text-destructive text-sm'>
        {t("conflicts.scanFailed", { error: getErrorMessage(error) })}
      </p>
    );
  } else if (data) {
    let list: React.ReactNode;
    if (groups.length === 0) {
      list = (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <CircleCheck className='h-12 w-12' />
            </EmptyMedia>
            <EmptyTitle>{t("conflicts.noneTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("conflicts.noneDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    } else if (visibleGroups.length === 0) {
      list = (
        <p className='py-8 text-center text-muted-foreground text-sm'>
          {t("conflicts.noSearchMatches")}
        </p>
      );
    } else {
      list = (
        <div className='grid gap-3 xl:grid-cols-2'>
          {visibleGroups.map((group) => (
            <ConflictGroupRow
              group={group}
              isBusy={isBusy}
              key={group.key}
              modsById={modsById}
              onIgnore={(actions) => ignore.mutate(actions)}
              onLoadFirst={(newWinner, currentWinner) =>
                makeWinner.mutate({ newWinner, currentWinner })
              }
            />
          ))}
        </div>
      );
    }
    body = (
      <>
        {list}
        <IgnoredSection
          ignored={data.ignored}
          ignoredMods={data.ignores.mods}
          modsById={modsById}
        />
      </>
    );
  }

  return (
    <Collapsible
      className='flex flex-col gap-3'
      onOpenChange={setHelpOpen}
      open={helpOpen}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>{summary}</p>
        <CollapsibleTrigger asChild>
          <Button size='sm' variant='ghost'>
            {t("conflicts.howItWorks")}
            <ChevronDown
              aria-hidden
              className='h-4 w-4 transition-transform data-[open=true]:rotate-180'
              data-open={helpOpen}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <LoadOrderHelp />
      </CollapsibleContent>
      {body}
    </Collapsible>
  );
};
