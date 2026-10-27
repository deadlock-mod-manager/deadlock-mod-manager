import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { audioWaveform } from "@/lib/audio-waveform";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";

interface Props {
  addonId?: string;
  hierarchy: ModdingHierarchy;
  path: string;
  revision: number;
  archive?: boolean;
  archivePath?: string;
}

export const AddonAudioPreview = (file: Props) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [position, setPosition] = useState(0);
  const audio = useQuery({
    queryKey: [
      "workbench-audio",
      file.addonId,
      file.hierarchy,
      file.path,
      file.revision,
      file.archive ?? false,
      file.archivePath,
    ],
    queryFn: async () => {
      const url = await invoke<string>(
        file.archive ? "preview_modding_archive_file" : "preview_modding_audio",
        {
          addonId: file.addonId,
          hierarchy: file.hierarchy,
          path: file.path,
          archivePath: file.archivePath,
        },
      );
      const bytes = await (await fetch(url)).arrayBuffer();
      const context = new OfflineAudioContext(1, 1, 8000);
      const buffer = await context.decodeAudioData(bytes);
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channel) => buffer.getChannelData(channel),
      );
      return { url, peaks: audioWaveform(channels), duration: buffer.duration };
    },
    retry: false,
    gcTime: 0,
    meta: { skipGlobalErrorHandler: true },
  });
  if (!audio.data) {
    return (
      <p
        role={audio.error ? "alert" : "status"}
        className='p-4 text-sm text-muted-foreground'>
        {audio.error?.message ?? t("common.loading")}
      </p>
    );
  }
  const { peaks, duration, url } = audio.data;
  const outline = peaks
    .map(
      (peak, index) =>
        `${(index * 1000) / Math.max(1, peaks.length - 1)},${50 - peak * 45}`,
    )
    .join(" ");
  const lower = peaks
    .map((_, index) => {
      const reverseIndex = peaks.length - 1 - index;
      return `${(reverseIndex * 1000) / Math.max(1, peaks.length - 1)},${50 + (peaks[reverseIndex] ?? 0) * 45}`;
    })
    .join(" ");
  return (
    <div className='flex h-full flex-col justify-center gap-4 p-4'>
      <div className='relative h-40 rounded-md bg-muted/30'>
        <svg
          viewBox='0 0 1000 100'
          preserveAspectRatio='none'
          aria-hidden='true'
          className='h-full w-full text-primary'>
          <polygon
            points={`${outline} ${lower}`}
            fill='currentColor'
            opacity='0.65'
          />
          <line
            x1={(position / Math.max(duration, 0.001)) * 1000}
            x2={(position / Math.max(duration, 0.001)) * 1000}
            y1='0'
            y2='100'
            stroke='currentColor'
            strokeWidth='3'
          />
        </svg>
        <input
          type='range'
          min={0}
          max={duration}
          step={0.01}
          value={position}
          aria-label={t("workbenchExplorer.audioSeek")}
          className='absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:opacity-100'
          onChange={(event) => {
            const time = Number(event.target.value);
            if (audioRef.current) audioRef.current.currentTime = time;
            setPosition(time);
          }}
        />
      </div>
      <audio
        key={url}
        ref={audioRef}
        src={url}
        controls
        preload='metadata'
        aria-label={t("workbenchExplorer.audioControls")}
        className='w-full'
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={() => setPosition(0)}
      />
    </div>
  );
};
