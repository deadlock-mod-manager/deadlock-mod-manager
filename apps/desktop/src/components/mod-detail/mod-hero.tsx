import type { ModDto } from '@deadlock-mods/utils';
import { Music } from 'lucide-react';
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ModHeroProps {
  mod: ModDto;
  shouldBlur?: boolean;
}

export const ModHero = ({ mod, shouldBlur = false }: ModHeroProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasImages = mod.images && mod.images.length > 0;

  // Audio mod hero
  if (mod.isAudio && mod.audioUrl) {
    return (
      <div className="relative h-64 w-full bg-gradient-to-br from-muted via-secondary to-accent">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mb-6 flex flex-col items-center gap-4">
            <Music className="h-16 w-16 text-primary" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 p-6">
          <h1 className="font-bold text-3xl text-primary">{mod.name}</h1>
          <p className="mt-2 text-primary/80">{mod.category}</p>
          <Badge className="mt-2" variant="secondary">
            Audio Mod
          </Badge>
        </div>
        {mod.audioUrl && (
          <audio preload="metadata" ref={audioRef} src={mod.audioUrl} />
        )}
      </div>
    );
  }

  // Image hero
  if (mod.hero && hasImages) {
    return (
      <div className="relative z-10 h-64 w-full">
        <img
          alt={`${mod.name} hero`}
          className={cn(
            'h-full w-full object-cover opacity-70',
            shouldBlur && 'blur-lg'
          )}
          height="256"
          src={mod.images[0]}
          width="1200"
        />
        {!shouldBlur && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        )}
        <div className="absolute bottom-0 left-0 space-y-2 p-6">
          <h1 className="font-bold text-3xl text-white">{mod.name}</h1>
          <p className="text-muted-foreground">{mod.category}</p>
        </div>
      </div>
    );
  }

  // No hero
  return null;
};
