import { Switch } from "@deadlock-mods/ui/components/switch";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useGuardedSections } from "@/hooks/performance/use-guarded-sections";

type EngineSectionsNoticeProps = {
  count: number;
  sections: string[];
  included: boolean;
  onIncludedChange: (included: boolean) => void;
};

const LISTED_SECTIONS = 3;

/** Engine-section edits are left out unless the user includes them for this config. */
export const EngineSectionsNotice = ({
  count,
  sections,
  included,
  onIncludedChange,
}: EngineSectionsNoticeProps) => {
  const { t } = useTranslation();
  const guarded = useGuardedSections(sections);
  const listed = sections.slice(0, LISTED_SECTIONS).join(", ");
  const sectionList =
    sections.length > LISTED_SECTIONS
      ? t("performance.editor.engine.sectionsMore", {
          sections: listed,
          count: sections.length - LISTED_SECTIONS,
        })
      : listed;

  return (
    <div className='flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3'>
      <ShieldWarningIcon className='mt-0.5 size-4 shrink-0 text-amber-400' />
      <div className='min-w-0 flex-1 space-y-0.5 text-sm'>
        <p>
          {included
            ? t("performance.editor.engine.included", {
                count,
                sections: sectionList,
              })
            : t("performance.editor.engine.excluded", {
                count,
                sections: sectionList,
              })}
        </p>
        {guarded.length > 0 && (
          <p className='text-muted-foreground text-xs'>
            {t("performance.editor.engine.valveMessage", {
              sections: guarded.join(", "),
            })}
          </p>
        )}
      </div>
      <label className='flex shrink-0 items-center gap-2 text-muted-foreground text-sm'>
        <Switch checked={included} onCheckedChange={onIncludedChange} />
        {t("performance.editor.engine.toggle")}
      </label>
    </div>
  );
};
