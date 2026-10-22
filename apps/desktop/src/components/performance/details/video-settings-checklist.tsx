import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterTabs } from "@/components/performance/filter-tabs";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { VideoVariant } from "@/types/generated/VideoVariant";
import { DetailsSection } from "./details-parts";

/**
 * The author's in-game video settings. We never write video.txt. When the
 * author ships several video.txt files, each one is a variant to pick from.
 */
export const VideoSettingsChecklist = ({
  settings,
  variants = [],
  notes,
}: {
  settings: VideoSetting[];
  variants?: VideoVariant[];
  notes: string[];
}) => {
  const { t } = useTranslation();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [variant, setVariant] = useState(variants[0]?.label ?? "");
  const shown =
    variants.find((candidate) => candidate.label === variant)?.settings ??
    settings;

  if (shown.length === 0 && notes.length === 0) return null;

  const toggle = (key: string, checked: boolean) =>
    setDone((previous) => {
      const next = new Set(previous);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <DetailsSection
      description={
        shown.length > 0
          ? t("performance.details.video.description")
          : undefined
      }
      title={
        shown.length > 0
          ? t("performance.details.video.title")
          : t("performance.details.video.notesTitle")
      }>
      {variants.length > 1 && (
        <div className='flex'>
          <FilterTabs
            ariaLabel={t("performance.details.video.variantLabel")}
            onValueChange={setVariant}
            tabs={variants.map(({ label }) => ({ value: label, label }))}
            value={variant}
          />
        </div>
      )}
      {shown.length > 0 && (
        <ul className='divide-y rounded-md border'>
          {shown.map((setting) => {
            const id = `video-setting-${setting.key}`;
            const doneKey = `${variant}:${setting.key}`;
            return (
              <li
                className='flex items-center gap-3 px-3 py-2'
                key={setting.key}>
                <Checkbox
                  checked={done.has(doneKey)}
                  id={id}
                  onCheckedChange={(checked) =>
                    toggle(doneKey, checked === true)
                  }
                />
                <label
                  className='min-w-0 flex-1 truncate text-sm'
                  htmlFor={id}
                  title={setting.key}>
                  {setting.label ?? setting.key}
                </label>
                <span className='shrink-0 font-medium text-sm'>
                  {setting.display ?? setting.value}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {notes.map((note) => (
        <p
          className='flex items-start gap-1.5 text-muted-foreground text-xs'
          key={note}>
          <InfoIcon aria-hidden className='mt-0.5 size-3.5 shrink-0' />
          {note}
        </p>
      ))}
    </DetailsSection>
  );
};
