import { Music, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudio } from "@/hooks/use-audio";
import { cn } from "@/lib/utils";

export type AudioPlayerVariant = "default" | "compact" | "hero";

interface AudioPlayerPreviewProps {
  audioUrl: string;
  variant?: AudioPlayerVariant;
  className?: string;
  onPlayClick?: (e: React.MouseEvent) => void;
}

const variantStyles = {
  default: {
    container:
      "relative flex h-48 w-full flex-col items-center justify-center overflow-hidden rounded-t-xl bg-gradient-to-br from-muted via-secondary to-accent",
    content: "relative z-10 flex flex-col items-center gap-2",
    icon: "h-8 w-8 text-primary",
    button: "border-primary/30 bg-primary/20 text-primary hover:bg-primary/30",
    buttonSize: "sm" as const,
  },
  compact: {
    container:
      "relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-l-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5",
    content: "relative z-10 flex items-center justify-center",
    icon: "h-6 w-6 text-primary", // Not used in compact mode
    button:
      "h-8 w-8 border-primary/40 p-0 text-primary shadow-sm transition-all duration-200",
    buttonSize: "sm" as const,
  },
  hero: {
    container:
      "relative h-64 w-full bg-gradient-to-br from-muted via-secondary to-accent",
    content: "absolute inset-0 flex flex-col items-center justify-center",
    icon: "h-16 w-16 text-primary",
    button: "border-primary/30 bg-primary/20 text-primary hover:bg-primary/30",
    buttonSize: "default" as const,
  },
};

const AudioPlayerPreview = ({
  audioUrl,
  variant = "default",
  className,
  onPlayClick,
}: AudioPlayerPreviewProps) => {
  const { isPlaying, audioRef, togglePlayback, handleAudioEnded } = useAudio();

  const handleClick = (e: React.MouseEvent) => {
    onPlayClick?.(e);
    togglePlayback();
  };

  const styles = variantStyles[variant];

  // Dynamic button classes for compact variant
  const getCompactButtonClasses = () => {
    if (variant !== "compact") {
      return styles.button;
    }

    return cn(
      styles.button,
      isPlaying
        ? "scale-105 bg-primary/30 hover:bg-primary/40"
        : "bg-primary/20 hover:scale-110 hover:bg-primary/30",
    );
  };

  return (
    <div className={cn(styles.container, className)}>
      <div className={styles.content}>
        {variant !== "compact" && <Music className={styles.icon} />}
        {variant === "hero" && <div className='mb-6' />}
        <Button
          className={getCompactButtonClasses()}
          onClick={handleClick}
          size={styles.buttonSize}
          variant='outline'>
          {isPlaying ? (
            <Pause className='h-4 w-4' />
          ) : (
            <Play
              className={cn("h-4 w-4", variant === "compact" && "ml-0.5")}
            />
          )}
          {variant !== "compact" && (isPlaying ? "Pause" : "Preview")}
        </Button>
      </div>
      {audioUrl && (
        <audio
          onEnded={handleAudioEnded}
          preload='metadata'
          ref={audioRef}
          src={audioUrl}
        />
      )}
    </div>
  );
};

export default AudioPlayerPreview;
