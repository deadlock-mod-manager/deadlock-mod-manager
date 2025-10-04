import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Link } from "@tanstack/react-router";
import { Interweave } from "interweave";
import { LuDownload, LuEye, LuHeart } from "react-icons/lu";
import { formatDownloads } from "@/lib/utils";

interface ModPreviewProps {
  selectedMod: ModDto | null;
}

export const ModPreview = ({ selectedMod }: ModPreviewProps) => {
  if (!selectedMod) {
    return (
      <Card className='overflow-hidden border-muted/50 bg-background/50 backdrop-blur-sm'>
        <CardContent className='p-8 text-center sm:p-12'>
          <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5 sm:h-20 sm:w-20'>
            <LuEye className='h-8 w-8 text-primary/60 sm:h-10 sm:w-10' />
          </div>
          <h3 className='mb-2 font-semibold text-foreground text-lg sm:text-xl'>
            Select a Mod
          </h3>
          <p className='text-sm text-muted-foreground sm:text-base'>
            Choose a mod from the list to see its details
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='overflow-hidden border-muted/50 bg-background/50 backdrop-blur-sm'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50' />

      {/* Preview Header */}
      <CardHeader className='relative p-4 sm:p-6'>
        <div className='flex items-start justify-between'>
          <div className='min-w-0 flex-1'>
            <CardTitle className='mb-2 break-words font-bold text-lg text-foreground sm:text-xl lg:text-2xl'>
              {selectedMod.name}
            </CardTitle>
            <p className='mb-3 truncate text-sm text-muted-foreground sm:mb-4 sm:text-base'>
              by {selectedMod.author}
            </p>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2 text-xs sm:gap-4 sm:text-sm lg:gap-6'>
          <div className='flex items-center gap-1.5 sm:gap-2'>
            <LuDownload className='h-3.5 w-3.5 text-primary sm:h-4 sm:w-4' />
            <span className='font-medium text-foreground'>
              {formatDownloads(selectedMod.downloadCount)}
            </span>
            <span className='hidden text-muted-foreground sm:inline'>
              downloads
            </span>
          </div>
          <div className='flex items-center gap-1.5 sm:gap-2'>
            <LuHeart className='h-3.5 w-3.5 text-red-500 sm:h-4 sm:w-4' />
            <span className='font-medium text-foreground'>
              {selectedMod.likes}
            </span>
            <span className='hidden text-muted-foreground sm:inline'>
              likes
            </span>
          </div>
          <Badge className='border-none bg-gradient-to-r from-[#EFE1BE] to-primary text-xs text-primary-foreground'>
            {selectedMod.category}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='relative space-y-4 p-4 sm:space-y-6 sm:p-6 sm:pt-0'>
        <div className='relative aspect-video overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10'>
          {selectedMod.images && selectedMod.images.length > 0 ? (
            <img
              alt={`${selectedMod.name} preview`}
              className='h-full w-full object-cover'
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
              src={selectedMod.images[0]}
            />
          ) : null}
          <div
            className='absolute inset-0 flex items-center justify-center'
            style={{
              display:
                selectedMod.images && selectedMod.images.length > 0
                  ? "none"
                  : "flex",
            }}>
            <LuEye className='h-12 w-12 text-primary/60' />
          </div>
          <div className='absolute top-4 right-4'>
            <Badge className='border-primary/20 bg-background/80 text-foreground'>
              Preview
            </Badge>
          </div>
        </div>

        <div>
          <h4 className='mb-2 font-semibold text-sm text-foreground sm:text-base'>
            What this mod does
          </h4>
          <div className='text-sm text-muted-foreground leading-relaxed sm:text-base'>
            <Interweave
              content={`${selectedMod.description?.slice(0, 250) ?? "No Description"}...`}
              tagName='div'
            />
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Link to='/download'>
            <Button className='h-11 w-full font-semibold text-base shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-300 disabled:opacity-50 sm:h-12 sm:text-lg'>
              <div className='flex items-center gap-2'>
                <LuDownload className='h-4 w-4 sm:h-5 sm:w-5' />
                Install Mod
              </div>
            </Button>
          </Link>

          <p className='text-center text-muted-foreground text-xs'>
            Click once to install • Works automatically • Ready in seconds
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
