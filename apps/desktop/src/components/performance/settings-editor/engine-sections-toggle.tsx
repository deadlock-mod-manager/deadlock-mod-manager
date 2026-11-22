import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useGuardedSections } from "@/hooks/performance/use-guarded-sections";

type EngineSectionsToggleProps = {
  count: number;
  sections: string[];
  included: boolean;
  onIncludedChange: (included: boolean) => void;
};

const LISTED_SECTIONS = 3;

/** Engine-section edits are left out unless the user includes them for this config. */
export const EngineSectionsToggle = ({
  count,
  sections,
  included,
  onIncludedChange,
}: EngineSectionsToggleProps) => {
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
    <div className='flex items-center gap-2'>
      <Switch
        checked={included}
        id='perf-editor-engine-sections'
        onCheckedChange={onIncludedChange}
      />
      <Label
        className='font-normal text-muted-foreground text-sm'
        htmlFor='perf-editor-engine-sections'>
        {t("performance.editor.engine.title")}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t("performance.editor.engine.about")}
            className='inline-flex rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            type='button'>
            <InfoIcon className='size-3.5' />
          </button>
        </TooltipTrigger>
        <TooltipContent className='max-w-72 space-y-2'>
          <p>
            {t(
              included
                ? "performance.editor.engine.included"
                : "performance.editor.engine.excluded",
              { count, sections: sectionList },
            )}
          </p>
          {guarded.length > 0 && (
            <p>
              {t("performance.editor.engine.valveMessage", {
                sections: guarded.join(", "),
              })}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
