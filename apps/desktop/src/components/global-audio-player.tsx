import { useGlobalAudioElement } from "@/hooks/use-global-audio";

export const GlobalAudioPlayer = () => {
  const { audioRef, handleEnded, handleLoadedMetadata, handleTimeUpdate } =
    useGlobalAudioElement();

  return (
    <audio
      hidden
      onEnded={handleEnded}
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={handleTimeUpdate}
      ref={audioRef}
    />
  );
};
