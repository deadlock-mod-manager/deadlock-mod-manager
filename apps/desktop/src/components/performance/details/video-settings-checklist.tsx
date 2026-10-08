import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import { DetailsSection } from "./details-parts";

/** The author's in-game video settings. We never write video.txt. */
export const VideoSettingsChecklist = ({
  settings,
  notes,
}: {
  settings: VideoSetting[];
  notes: string[];
}) => {
  const { t } = useTranslation();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  if (settings.length === 0 && notes.length === 0) return null;

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
        settings.length > 0
          ? t("performance.details.video.description")
          : undefined
      }
      title={
        settings.length > 0
          ? t("performance.details.video.title")
          : t("performance.details.video.notesTitle")
      }>
      {settings.length > 0 && (
        <ul className='divide-y rounded-md border'>
          {settings.map((setting) => {
            const id = `video-setting-${setting.key}`;
            return (
              <li
                className='flex items-center gap-3 px-3 py-2'
                key={setting.key}>
                <Checkbox
                  checked={done.has(setting.key)}
                  id={id}
                  onCheckedChange={(checked) =>
                    toggle(setting.key, checked === true)
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
