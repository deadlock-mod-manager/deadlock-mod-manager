import { Collapsible } from "@deadlock-mods/ui/components/collapsible";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useGuardedSections } from "@/hooks/performance/use-guarded-sections";
import { useStoredRequestOptions } from "@/hooks/performance/use-perf-config-list";
import { engineSectionEdits } from "@/lib/performance/resolved-summary";
import { usePersistedStore } from "@/lib/store";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { EntryList, NotAppliedCard, ViewToggle } from "./not-applied-parts";

const MAX_LISTED_SECTIONS = 3;

export const EngineSectionsCard = ({
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
