import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { LuDownload, LuHeart, LuSettings } from "react-icons/lu";
import { formatDownloads } from "@/lib/utils";

interface ModCardProps {
  mod: ModDto;
  isSelected: boolean;
  onClick: () => void;
}

export const ModCard = ({ mod, isSelected, onClick }: ModCardProps) => {
  return (
    <Card
      className={`group cursor-pointer overflow-hidden transition-all duration-300 ${
        isSelected
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
          : "border-muted/50 bg-background/50 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5"
      }`}
      onClick={onClick}>
      <CardContent className='relative p-4 sm:p-5'>
        <div className='flex items-center gap-3 sm:gap-4'>
          <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm sm:h-16 sm:w-16'>
            {mod.images && mod.images.length > 0 ? (
              <img
                alt={`${mod.name} preview`}
                className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                src={mod.images[0]}
              />
            ) : null}
            <div
              className='absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5'
              style={{
                display: mod.images && mod.images.length > 0 ? "none" : "flex",
              }}>
              <LuSettings className='h-5 w-5 text-primary sm:h-6 sm:w-6' />
            </div>
          </div>

          <div className='min-w-0 flex-1 overflow-hidden'>
            <div className='mb-1.5 flex items-center gap-2'>
              <h4 className='truncate font-semibold text-sm text-foreground transition-colors group-hover:text-primary sm:text-base'>
                {mod.name}
              </h4>
            </div>
            <p className='mb-2.5 truncate text-muted-foreground text-xs sm:text-sm'>
              by {mod.author}
            </p>
            <div className='flex flex-wrap items-center gap-3 text-muted-foreground text-xs sm:gap-4'>
              <div className='flex items-center gap-1.5'>
                <LuDownload className='h-3 w-3 text-primary' />
                <span className='font-medium'>
                  {formatDownloads(mod.downloadCount)}
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <LuHeart className='h-3 w-3 text-red-500' />
                <span className='font-medium'>{mod.likes}</span>
              </div>
              <Badge
                className='border-primary/30 bg-primary/10 text-primary text-xs font-medium'
                variant='outline'>
                {mod.category}
              </Badge>
            </div>
          </div>

          <div
            className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-300 sm:h-3 sm:w-3 ${
              isSelected
                ? "scale-125 bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)] ring-2 ring-primary/30"
                : "bg-primary/20 group-hover:bg-primary/40"
            }`}
          />
        </div>
      </CardContent>
    </Card>
  );
};
