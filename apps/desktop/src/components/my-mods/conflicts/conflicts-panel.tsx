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
import { ChevronDown, CircleCheck, Loader2 } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useConflictIgnore,
  useMakeConflictWinner,
  useProfileConflicts,
} from "@/hooks/use-profile-conflicts";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import { ConflictGroupRow } from "./conflict-group-row";
import { IgnoredSection } from "./ignored-section";
import { LoadOrderHelp } from "./load-order-help";

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
    if (hiddenModels === 0) {
      summary += ` ${t("conflicts.summaryNoModels", { count: groups.length })}`;
    } else {
      const key =
        hiddenModels === groups.length
          ? "conflicts.summaryModelsAll"
          : "conflicts.summaryModels";
      summary += ` ${t(key, { count: hiddenModels })}`;
    }
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
        <div className='text-sm'>
          <p>{summary}</p>
          {groups.length > 0 && (
            <p className='text-muted-foreground'>{t("conflicts.safeNote")}</p>
          )}
        </div>
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
