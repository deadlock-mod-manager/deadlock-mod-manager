import { Button } from "@deadlock-mods/ui/components/button";
import { Music, Pause, Play } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useGlobalAudio } from "@/hooks/use-global-audio";
import { cn } from "@/lib/utils";

interface SoundPreviewButtonProps {
  modId: string;
  audioUrl: string | null | undefined;
}

/** Plays the clip the author uploaded; a note icon stands in when there is none. */
export const SoundPreviewButton = ({
  modId,
  audioUrl,
}: SoundPreviewButtonProps) => {
  const { t } = useTranslation();
  const { isPlaying, togglePlayback } = useGlobalAudio(modId, audioUrl ?? "");

  if (!audioUrl) {
    return (
      <span
        className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
        role='img'
        aria-label={t("skins.noSoundPreview")}
        title={t("skins.noSoundPreview")}>
        <Music className='h-3.5 w-3.5' />
      </span>
    );
  }

  const label = isPlaying ? t("skins.pauseSound") : t("skins.playSound");

  return (
    <Button
      aria-label={label}
      className={cn(
        "size-8 shrink-0 rounded-full [&_svg]:size-3.5",
        isPlaying
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      )}
      onClick={togglePlayback}
      size='icon'
      title={label}
      variant='secondary'>
      {isPlaying ? (
        <Pause fill='currentColor' />
      ) : (
        <Play className='ml-0.5' fill='currentColor' />
      )}
    </Button>
  );
};
