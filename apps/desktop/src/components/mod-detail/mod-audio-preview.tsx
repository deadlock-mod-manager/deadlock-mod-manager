import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Pause, Play, Volume2 } from "@deadlock-mods/ui/icons";
import { useGlobalAudio, useGlobalAudioStore } from "@/hooks/use-global-audio";

interface ModAudioPreviewProps {
  audioUrl: string;
  isAudio?: boolean;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const ModAudioPreview = ({
  audioUrl,
  isAudio = false,
}: ModAudioPreviewProps) => {
  const { isPlaying, togglePlayback, seek } = useGlobalAudio(
    audioUrl,
    audioUrl,
  );
  const duration = useGlobalAudioStore((s) =>
    s.currentUrl === audioUrl ? s.duration : 0,
  );
  const currentTime = useGlobalAudioStore((s) =>
    s.currentUrl === audioUrl ? s.currentTime : 0,
  );

  if (!isAudio || !audioUrl) {
    return null;
  }

  const handleSeek = (value: number[]) => {
    if (value[0] !== undefined) {
      seek(value[0]);
    }
  };

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Volume2 className='h-5 w-5' />
          Audio Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='flex items-center gap-4 px-2'>
          <Button
            className='h-10 w-10 shrink-0 rounded-full'
            onClick={togglePlayback}
            size='icon'
            variant='outline'>
            {isPlaying ? (
              <Pause className='h-4 w-4' />
            ) : (
              <Play className='ml-0.5 h-4 w-4' />
            )}
          </Button>
          <div className='flex min-w-0 flex-1 items-center gap-3'>
            <span className='w-10 shrink-0 text-muted-foreground text-xs tabular-nums'>
              {formatTime(currentTime)}
            </span>
            <Slider
              max={duration || 100}
              min={0}
              onValueChange={handleSeek}
              step={0.1}
              value={[currentTime]}
            />
            <span className='w-10 shrink-0 text-muted-foreground text-xs tabular-nums'>
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
