import { useEffect, useState } from "react";
import logger from "@/lib/logger";
import { useFoundry } from "./foundry-context";

/** Peaks kept per clip; drawn bars are resampled from these to fit. */
const PEAK_RESOLUTION = 200;

interface ClipInfo {
  peaks: number[];
  duration: number;
}

let audioContext: AudioContext | null = null;

const clipInfoCache = new Map<string, Promise<ClipInfo | null>>();

/** Decode a clip once and keep its loudness envelope and length. */
const loadClipInfo = (
  key: string,
  url: () => Promise<string>,
): Promise<ClipInfo | null> => {
  const cached = clipInfoCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    try {
      audioContext ??= new AudioContext();
      const bytes = await (await fetch(await url())).arrayBuffer();
      const buffer = await audioContext.decodeAudioData(bytes);
      const data = buffer.getChannelData(0);
      const size = Math.max(1, Math.floor(data.length / PEAK_RESOLUTION));
      const peaks: number[] = [];
      let loudest = 0;
      for (let bar = 0; bar < PEAK_RESOLUTION; bar++) {
        let peak = 0;
        for (let i = bar * size; i < (bar + 1) * size && i < data.length; i++) {
          peak = Math.max(peak, Math.abs(data[i]));
        }
        peaks.push(peak);
        loudest = Math.max(loudest, peak);
      }
      return {
        peaks: peaks.map((peak) => (loudest > 0 ? peak / loudest : 0)),
        duration: buffer.duration,
      };
    } catch (err) {
      logger.withError(err).warn("[Foundry] Could not decode a clip");
      return null;
    }
  })();
  clipInfoCache.set(key, pending);
  return pending;
};

export const useClipInfo = (
  path: string | null,
  original: boolean,
  enabled: boolean,
  revision: number,
) => {
  const { playSound, manifest } = useFoundry();
  const [info, setInfo] = useState<ClipInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!path || !enabled || !manifest) return;
    let cancelled = false;
    const key = `${manifest.filePath}\n${path}\n${original}\n${revision}`;
    void loadClipInfo(key, () => playSound(path, original)).then((loaded) => {
      if (!cancelled) setInfo(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [path, original, enabled, manifest, playSound, revision]);
  return info;
};
