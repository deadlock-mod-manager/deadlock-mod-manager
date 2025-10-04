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
      className={`cursor-pointer overflow-hidden transition-all duration-300 ${
        isSelected
          ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/20"
          : "border-primary/20 bg-card/80 hover:border-primary/40 hover:bg-primary/5"
      }`}
      onClick={onClick}>
      <CardContent className='relative p-4'>
        <div className='flex items-center gap-4'>
          <div className='relative h-16 w-16 overflow-hidden rounded-lg border border-primary/20'>
            {mod.images && mod.images.length > 0 ? (
              <img
                alt={`${mod.name} preview`}
                className='h-full w-full object-cover'
                src={mod.images[0]}
              />
            ) : null}
            <div
              className='absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5'
              style={{
                display: mod.images && mod.images.length > 0 ? "none" : "flex",
              }}>
              <LuSettings className='h-6 w-6 text-primary' />
            </div>
          </div>

          <div className='min-w-0 flex-1'>
            <div className='mb-1 flex items-center gap-2'>
              <h4 className='truncate font-semibold text-foreground'>
                {mod.name}
              </h4>
            </div>
            <p className='mb-2 text-muted-foreground text-sm'>
              by {mod.author}
            </p>
            <div className='flex items-center gap-4 text-muted-foreground text-xs'>
              <div className='flex items-center gap-1'>
                <LuDownload className='h-3 w-3' />
                <span>{formatDownloads(mod.downloadCount)}</span>
              </div>
              <div className='flex items-center gap-1'>
                <LuHeart className='h-3 w-3 text-red-500' />
                <span>{mod.likes}</span>
              </div>
              <Badge
                className='border-primary/30 text-primary text-xs'
                variant='outline'>
                {mod.category}
              </Badge>
            </div>
          </div>

          <div
            className={`h-3 w-3 rounded-full transition-all duration-300 ${
              isSelected
                ? "bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                : "bg-primary/20"
            }`}
          />
        </div>
      </CardContent>
    </Card>
  );
};
