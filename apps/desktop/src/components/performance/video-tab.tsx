import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { MonitorIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  usePerfConfigList,
  useStoredRequestOptions,
} from "@/hooks/performance/use-perf-config-list";
import {
  usePerfCatalog,
  usePerfStatus,
} from "@/hooks/performance/use-perf-queries";
import type { ApplicableConfig } from "@/lib/performance/config-list";
import { sameApplyOptions } from "@/lib/performance/overrides";
import { configVideo } from "@/lib/performance/video";
import { AdoptVideoButton } from "./adopt-video-button";
import { ApplyConfigButton } from "./configs/apply-config-button";
import { VideoBackupNotice } from "./details/video-backup-notice";
import { VideoSettings } from "./details/video-settings";
import { VideoChanges } from "./video-changes";

/**
 * The applied config's video.txt: what changed in game since it was written,
 * what it writes, the switch, and the way back to your own file.
 */
export const VideoTab = () => {
  const { t } = useTranslation();
  const { desired, activeItem } = usePerfConfigList();
  const { data: catalog } = usePerfCatalog();
  const { data: status } = usePerfStatus();
  const configId = desired?.request.configId ?? "";
  const options = useStoredRequestOptions(configId);

  const video = desired
    ? configVideo(desired.request, catalog?.presets ?? [])
    : null;
  if (!desired || !video || video.settings.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <MonitorIcon />
          </EmptyMedia>
          <EmptyTitle>{t("performance.video.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {desired
              ? t("performance.video.noVideo", {
                  name: activeItem?.name ?? desired.request.name,
                })
              : t("performance.video.noConfig")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <VideoBackupNotice />
        </EmptyContent>
      </Empty>
    );
  }

  const config: ApplicableConfig | null =
    activeItem?.kind === "preset"
      ? { kind: "preset", preset: activeItem.preset }
      : activeItem?.kind === "user"
        ? { kind: "user", config: activeItem.config }
        : null;
  const hasChanges = !sameApplyOptions(desired.request, options);
  // What the file holds describes the applied choice, not a pending one.
  const changes =
    status && !hasChanges && desired.request.writeVideo
      ? status.video.changed
      : [];

  return (
    <div className='flex flex-col gap-4'>
      <VideoBackupNotice
        action={
          desired.request.writeVideo && (
            <AdoptVideoButton name={activeItem?.name ?? desired.request.name} />
          )
        }
      />
      <VideoChanges changes={changes} />
      <VideoSettings
        configId={configId}
        notes={[]}
        settings={video.settings}
        showBackup={false}
        variants={video.variants}
      />
      {hasChanges && config && (
        <div className='flex items-center justify-end gap-3'>
          <p className='text-muted-foreground text-xs'>
            {t("performance.details.footer.pendingChanges")}
          </p>
          <ApplyConfigButton config={config} entryPoint='details' />
        </div>
      )}
    </div>
  );
};
