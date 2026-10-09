import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { InfoIcon } from "@phosphor-icons/react";
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
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-muted-foreground text-xs'>
      <p className='min-w-0 flex-1'>
        {included
          ? t("performance.editor.engine.included", {
              count,
              sections: sectionList,
            })
          : t("performance.editor.engine.excluded", {
              count,
              sections: sectionList,
            })}
        {guarded.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={t("performance.editor.engine.why")}
                className='ml-1.5 inline-flex translate-y-0.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                type='button'>
                <InfoIcon className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent className='max-w-72'>
              {t("performance.editor.engine.valveMessage", {
                sections: guarded.join(", "),
              })}
            </TooltipContent>
          </Tooltip>
        )}
      </p>
      <label className='flex shrink-0 items-center gap-2'>
        <Switch
          checked={included}
          className='scale-90'
          onCheckedChange={onIncludedChange}
        />
        {t("performance.editor.engine.toggle")}
      </label>
    </div>
  );
};
