import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { Link } from "@tanstack/react-router";
import { LuDownload, LuHeart, LuSettings } from "react-icons/lu";
import { ModDescription } from "@/components/mods/mod-description";
import { NSFWBlur } from "@/components/mods/nsfw-blur";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { formatDownloads } from "@/lib/utils";

interface BrowseModCardProps {
  mod: ModDto;
}

export const BrowseModCard = ({ mod }: BrowseModCardProps) => {
  const { saveScrollPosition } = useScrollPosition("/mods");
  const { shouldBlur, nsfwSettings } = useNSFWBlur(mod);

  return (
    <Link
      to='/mod/$id'
      params={{ id: mod.remoteId }}
      onClick={(e) => {
        // Save scroll position before navigation
        const scrollContainer = (e.currentTarget as HTMLElement).closest(
          ".overflow-y-auto",
        );
        if (scrollContainer) {
          // Save the current scroll position of the container
          saveScrollPosition();
        }
      }}>
      <Card className='group h-full cursor-pointer overflow-hidden border-muted/50 bg-background/50 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-primary/40 hover:bg-primary/5 hover:shadow-lg'>
        <CardContent className='relative p-0'>
          <NSFWBlur
            isNSFW={shouldBlur}
            blurStrength={nsfwSettings.blurStrength}
            disableBlur={nsfwSettings.disableBlur}
            className='relative aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5'>
            {mod.images && mod.images.length > 0 ? (
              <img
                alt={`${mod.name} preview`}
                className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                src={mod.images[0]}
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <LuSettings className='h-16 w-16 text-primary/30' />
              </div>
            )}
            <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent' />
          </NSFWBlur>

          <div className='space-y-3 p-4'>
            <div className='space-y-1'>
              <h3 className='line-clamp-1 font-semibold text-foreground text-lg transition-colors group-hover:text-primary'>
                {mod.name}
              </h3>
              <p className='line-clamp-1 text-muted-foreground text-sm'>
                by {mod.author}
              </p>
            </div>

            {mod.description && (
              <div className='line-clamp-2 text-muted-foreground text-sm'>
                <ModDescription description={mod.description} textOnly />
              </div>
            )}

            <div className='flex flex-wrap items-center gap-3 text-muted-foreground text-sm'>
              <div className='flex items-center gap-1.5'>
                <LuDownload className='h-4 w-4 text-primary' />
                <span className='font-medium'>
                  {formatDownloads(mod.downloadCount)}
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <LuHeart className='h-4 w-4 text-red-500' />
                <span className='font-medium'>{mod.likes}</span>
              </div>
              <Badge
                className='border-primary/30 bg-primary/10 text-primary text-xs font-medium'
                variant='outline'>
                {mod.category}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
