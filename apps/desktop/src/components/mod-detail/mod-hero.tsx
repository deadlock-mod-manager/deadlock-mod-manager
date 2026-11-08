import type { ModDto } from "@deadlock-mods/shared";
import type { ReactNode } from "react";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Hash, Music } from "@deadlock-mods/ui/icons";
import { getModCategoryDisplayName } from "@/lib/constants";
import { useModHasUpdate } from "@/hooks/use-check-updates";
import { cn } from "@/lib/utils";
import { ModUpdateBadge } from "../mod-management/mod-update-badges";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { isNativeSourceMod } from "@/lib/mod-sources";

interface ModHeroProps {
  mod: ModDto;
  shouldBlur?: boolean;
  actions?: ReactNode;
  cornerAction?: ReactNode;
  imageFit?: "cover" | "contain";
  /** Shown beside the category, like a withheld badge. */
  status?: ReactNode;
  /** Desaturates the banner for mods that can't be installed. */
  muted?: boolean;
}

export const ModHero = ({
  mod,
  shouldBlur = false,
  actions,
  cornerAction,
  imageFit = "cover",
  status,
  muted = false,
}: ModHeroProps) => {
  const hasImages = mod.images && mod.images.length > 0;
  const native = isNativeSourceMod(mod.remoteId);
  const localMod = usePersistedStore((state) =>
    findLocalMod(state.localMods, mod.remoteId),
  );
  const hasUpdate = useModHasUpdate(localMod);

  // Audio mod hero
  if (mod.isAudio && mod.audioUrl) {
    return (
      <div className='relative h-64 w-full bg-gradient-to-br from-muted via-secondary to-accent'>
        {!native && (
          <div className='absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-white/70 text-xs shadow-lg backdrop-blur-md'>
            <Hash className='h-3 w-3' />
            <span className='tabular-nums'>{mod.remoteId}</span>
          </div>
        )}
        {actions && (
          <div className='absolute top-4 right-4 z-20'>{actions}</div>
        )}
        <div className='absolute inset-0 flex flex-col items-center justify-center'>
          <div className='mb-6 flex flex-col items-center gap-4'>
            <Music className='h-16 w-16 text-primary' />
          </div>
        </div>
        <div className='absolute bottom-0 left-0 p-6'>
          <h1 className='font-bold text-3xl text-primary'>
            {mod.name} <ModUpdateBadge mod={mod} hasUpdate={hasUpdate} />
          </h1>
          <div className='mt-2 flex items-center gap-2.5'>
            {status}
            <p className='text-primary/80'>{mod.category}</p>
          </div>
          <Badge className='mt-2' variant='secondary'>
            Audio Mod
          </Badge>
        </div>
      </div>
    );
  }

  // Image hero
  if (hasImages) {
    return (
      <div className='relative z-10 h-64 w-full'>
        <img
          alt={`${mod.name} hero`}
          className={cn(
            "h-full w-full opacity-70",
            imageFit === "contain" ? "object-contain" : "object-cover",
            shouldBlur && "blur-lg will-change-[filter] [contain:strict]",
            muted && "brightness-75 grayscale",
          )}
          decoding='async'
          height='256'
          src={mod.images[0]}
          width='1200'
        />
        {!shouldBlur && (
          <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent' />
        )}
        {!native && (
          <div className='absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-white/70 text-xs shadow-lg backdrop-blur-md'>
            <Hash className='h-3 w-3' />
            <span className='tabular-nums'>{mod.remoteId}</span>
          </div>
        )}
        {actions && (
          <div className='absolute top-4 right-4 z-20'>{actions}</div>
        )}
        <div className='absolute bottom-0 left-0 space-y-2 p-6'>
          <h1 className='font-bold text-3xl text-white'>
            {mod.name} <ModUpdateBadge mod={mod} hasUpdate={hasUpdate} />
          </h1>
          <div className='flex items-center gap-2.5'>
            {status}
            <p className='text-muted-foreground'>
              {getModCategoryDisplayName(mod.category)}
            </p>
          </div>
        </div>
        {cornerAction && (
          <div className='absolute right-6 bottom-6 z-20'>{cornerAction}</div>
        )}
      </div>
    );
  }

  // No hero
  return null;
};
