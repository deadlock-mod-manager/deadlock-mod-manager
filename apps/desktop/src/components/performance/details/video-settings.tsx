import { Switch } from "@deadlock-mods/ui/components/switch";
import { InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { FilterTabs } from "@/components/performance/filter-tabs";
import { useStoredRequestOptions } from "@/hooks/performance/use-perf-config-list";
import { usePersistedStore } from "@/lib/store";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { VideoVariant } from "@/types/generated/VideoVariant";
import { DetailsSection } from "./details-parts";
import { VideoBackupNotice } from "./video-backup-notice";

/**
 * The author's video.txt settings, written with the config unless the user
 * turns them off. When the author ships several video.txt files, each one is a
 * variant to pick from.
 */
export const VideoSettings = ({
  configId,
  settings,
  variants = [],
  notes,
  showBackup = true,
}: {
  configId: string;
  settings: VideoSetting[];
  variants?: VideoVariant[];
  notes: string[];
  /** Off where the page shows the saved-copy row itself. */
  showBackup?: boolean;
}) => {
  const { t } = useTranslation();
  const { writeVideo, videoVariant } = useStoredRequestOptions(configId);
  const setVideoChoice = usePersistedStore((state) => state.setPerfVideoChoice);
  const variant = videoVariant ?? variants[0]?.label ?? "";
  const shown =
    variants.find((candidate) => candidate.label === variant)?.settings ??
    settings;

  if (shown.length === 0 && notes.length === 0) return null;

  const switchId = `write-video-${configId}`;
  const pickVariant = (label: string) =>
    setVideoChoice(configId, {
      write: writeVideo,
      variant: label === variants[0]?.label ? null : label,
    });

  return (
    <DetailsSection
      description={
        shown.length === 0
          ? undefined
          : writeVideo
            ? t("performance.details.video.description")
            : t("performance.details.video.descriptionOff")
      }
      title={
        shown.length > 0
          ? t("performance.details.video.title")
          : t("performance.details.video.notesTitle")
      }>
      {shown.length > 0 && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          {variants.length > 1 ? (
            <FilterTabs
              ariaLabel={t("performance.details.video.variantLabel")}
              onValueChange={pickVariant}
              tabs={variants.map(({ label }) => ({ value: label, label }))}
              value={variant}
            />
          ) : (
            <span />
          )}
          <label
            className='flex items-center gap-2 text-muted-foreground text-xs'
            htmlFor={switchId}>
            <Switch
              checked={writeVideo}
              id={switchId}
              onCheckedChange={(checked) =>
                setVideoChoice(configId, {
                  write: checked,
                  variant: videoVariant,
                })
              }
            />
            {t("performance.details.video.write")}
          </label>
        </div>
      )}
      {shown.length > 0 && (
        <ul className='divide-y rounded-md border bg-card'>
          {shown.map((setting) => (
            <li className='flex items-center gap-3 px-3 py-2' key={setting.key}>
              <span
                className='min-w-0 flex-1 truncate text-sm'
                title={setting.key}>
                {setting.label ?? setting.key}
              </span>
              <span className='shrink-0 font-medium text-sm'>
                {setting.display ?? setting.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {showBackup && <VideoBackupNotice />}
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
