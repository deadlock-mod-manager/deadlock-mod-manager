import { useEffect, useRef, useState } from 'react';
import { usePersistedStore } from '@/lib/store';

interface UseAudioOptions {
  /**
   * Called when the audio playback ends
   */
  onEnded?: () => void;
  /**
   * Called when the audio starts playing
   */
  onPlay?: () => void;
  /**
   * Called when the audio is paused
   */
  onPause?: () => void;
}

interface UseAudioReturn {
  /**
   * Whether the audio is currently playing
   */
  isPlaying: boolean;
  /**
   * Ref to attach to the audio element
   */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /**
   * Toggle audio playback - play if paused, pause if playing
   */
  togglePlayback: () => void;
  /**
   * Start playing the audio
   */
  play: () => void;
  /**
   * Pause the audio
   */
  pause: () => void;
  /**
   * Handler for the audio element's onEnded event
   */
  handleAudioEnded: () => void;
}

/**
 * Custom hook for managing audio playback state and controls
 */
export const useAudio = (options: UseAudioOptions = {}): UseAudioReturn => {
  const { onEnded, onPlay, onPause } = options;
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioVolume = usePersistedStore((state) => state.audioVolume);

  // Apply volume whenever it changes or audio element is loaded
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume / 100;
    }
  }, [audioVolume]);

  const play = () => {
    if (!audioRef.current) {
      return;
    }

    // Ensure volume is set before playing
    audioRef.current.volume = audioVolume / 100;
    audioRef.current.play();
    setIsPlaying(true);
    onPlay?.();
  };

  const pause = () => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    setIsPlaying(false);
    onPause?.();
  };

  const togglePlayback = () => {
    if (!audioRef.current) {
      return;
    }

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    onEnded?.();
  };

  return {
    isPlaying,
    audioRef,
    togglePlayback,
    play,
    pause,
    handleAudioEnded,
  };
};
