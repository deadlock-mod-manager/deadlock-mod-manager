import { create } from "zustand";
import { usePersistedStore } from "@/lib/store";
import { useCallback, useEffect, useRef } from "react";

interface GlobalAudioState {
  audioElement: HTMLAudioElement | null;
  currentUrl: string | null;
  currentModId: string | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
}

interface GlobalAudioActions {
  setAudioElement: (el: HTMLAudioElement | null) => void;
  setPlaying: (playing: boolean) => void;
  setCurrent: (modId: string, url: string) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  reset: () => void;
}

const useGlobalAudioStore = create<GlobalAudioState & GlobalAudioActions>(
  (set) => ({
    audioElement: null,
    currentUrl: null,
    currentModId: null,
    isPlaying: false,
    duration: 0,
    currentTime: 0,

    setAudioElement: (el) => set({ audioElement: el }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setCurrent: (modId, url) =>
      set({
        currentModId: modId,
        currentUrl: url,
        currentTime: 0,
        duration: 0,
      }),
    setDuration: (duration) => set({ duration }),
    setCurrentTime: (time) => set({ currentTime: time }),
    reset: () =>
      set({
        currentUrl: null,
        currentModId: null,
        isPlaying: false,
        duration: 0,
        currentTime: 0,
      }),
  }),
);

export { useGlobalAudioStore };

/**
 * Hook for the single global <audio> element to wire DOM events to the store.
 * Should only be used by GlobalAudioPlayer.
 */
export const useGlobalAudioElement = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioVolume = usePersistedStore((state) => state.audioVolume);

  useEffect(() => {
    useGlobalAudioStore.getState().setAudioElement(audioRef.current);
    return () => {
      useGlobalAudioStore.getState().setAudioElement(null);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume / 100;
    }
  }, [audioVolume]);

  const handleEnded = useCallback(() => {
    useGlobalAudioStore.getState().setPlaying(false);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      useGlobalAudioStore.getState().setDuration(audioRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      useGlobalAudioStore
        .getState()
        .setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  return { audioRef, handleEnded, handleLoadedMetadata, handleTimeUpdate };
};

/**
 * Play/pause controls scoped to a specific mod.
 * Multiple cards can call this -- only one plays at a time.
 */
export const useGlobalAudio = (modId: string, audioUrl: string) => {
  const isPlaying = useGlobalAudioStore(
    (s) => s.isPlaying && s.currentModId === modId && s.currentUrl === audioUrl,
  );
  const audioVolume = usePersistedStore((state) => state.audioVolume);

  const play = useCallback(() => {
    const audio = useGlobalAudioStore.getState().audioElement;
    if (!audio) return;

    const state = useGlobalAudioStore.getState();
    const isSameTrack =
      state.currentModId === modId && state.currentUrl === audioUrl;

    if (!isSameTrack) {
      useGlobalAudioStore.getState().setCurrent(modId, audioUrl);
      audio.src = audioUrl;
      audio.load();
    }

    audio.volume = audioVolume / 100;
    audio.play();
    useGlobalAudioStore.getState().setPlaying(true);
  }, [modId, audioUrl, audioVolume]);

  const pause = useCallback(() => {
    const audio = useGlobalAudioStore.getState().audioElement;
    if (!audio) return;

    audio.pause();
    useGlobalAudioStore.getState().setPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    const audio = useGlobalAudioStore.getState().audioElement;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  return { isPlaying, play, pause, togglePlayback, seek };
};
