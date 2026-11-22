import { useCallback, useEffect, useRef, useState } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryEntry } from "@/types/foundry";
import { useFoundry } from "./foundry-context";

type PlayerState =
  | { status: "idle" }
  | {
      status: "loading" | "playing" | "unplayable";
      path: string;
      original: boolean;
    };

const IDLE: PlayerState = { status: "idle" };

/** The tab's single audio element, with play-in-order and an A/B flip. */
export const useSoundPlayer = () => {
  const { playSound } = useFoundry();
  const volume = usePersistedStore((state) => state.foundrySoundVolume);
  const [state, setState] = useState<PlayerState>(IDLE);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<FoundryEntry[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const play = useCallback(
    async (path: string, original = false, startAt = 0) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      setState({ status: "loading", path, original });
      try {
        audio.volume = volumeRef.current;
        audio.src = await playSound(path, original);
        audio.currentTime = startAt;
        await audio.play();
        setState({ status: "playing", path, original });
      } catch (err) {
        logger.withError(err).warn("[Foundry] Sound preview unavailable");
        setState({ status: "unplayable", path, original });
      }
    },
    [playSound],
  );

  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("timeupdate", () =>
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0),
    );
    audio.addEventListener("ended", () => {
      setProgress(0);
      const next = queueRef.current.shift();
      if (next) void play(next.path);
      else setState(IDLE);
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [play]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    setState(IDLE);
    setProgress(0);
  }, []);

  const toggle = useCallback(
    (path: string, original = false) => {
      const current = stateRef.current;
      if (
        current.status === "playing" &&
        current.path === path &&
        current.original === original
      ) {
        stop();
        return;
      }
      queueRef.current = [];
      void play(path, original);
    },
    [play, stop],
  );

  const playAll = useCallback(
    (entries: FoundryEntry[]) => {
      const [first, ...rest] = entries;
      if (!first) return;
      queueRef.current = rest;
      void play(first.path);
    },
    [play],
  );

  /** Swap between the edit and the original without losing the place. */
  const flip = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "playing") return;
    void play(
      current.path,
      !current.original,
      audioRef.current?.currentTime ?? 0,
    );
  }, [play]);

  return { state, progress, toggle, playAll, flip };
};

export type SoundPlayer = ReturnType<typeof useSoundPlayer>;
