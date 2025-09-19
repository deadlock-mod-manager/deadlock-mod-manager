import type { ModDto } from "@deadlock-mods/shared";
import { Link } from "@tanstack/react-router";
import { Interweave } from "interweave";
import { LuDownload, LuEye, LuHeart } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDownloads } from "@/lib/utils";

interface ModPreviewProps {
  selectedMod: ModDto | null;
}

export const ModPreview = ({ selectedMod }: ModPreviewProps) => {
  if (!selectedMod) {
    return (
      <Card className='overflow-hidden border-primary/20 bg-card/90 shadow-[0_4px_20px_hsl(var(--primary)/0.1)] backdrop-blur-sm'>
        <CardContent className='p-12 text-center'>
          <LuEye className='mx-auto mb-4 h-16 w-16 text-primary/40' />
          <h3 className='mb-2 font-semibold text-foreground text-xl'>
            Select a Mod
          </h3>
          <p className='text-muted-foreground'>
            Choose a mod from the list to see its details
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='overflow-hidden border-primary/20 bg-card/90 shadow-[0_4px_20px_hsl(var(--primary)/0.1)] backdrop-blur-sm'>
      <div className='absolute inset-0 bg-gradient-to-br from-muted/10 to-muted/5 opacity-10' />

      {/* Preview Header */}
      <CardHeader className='relative'>
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle className='mb-2 font-bold text-2xl text-foreground'>
              {selectedMod.name}
            </CardTitle>
            <p className='mb-4 text-muted-foreground'>
              by {selectedMod.author}
            </p>
          </div>
        </div>

        <div className='flex items-center gap-6 text-sm'>
          <div className='flex items-center gap-2'>
            <LuDownload className='h-4 w-4 text-primary' />
            <span className='font-medium text-foreground'>
              {formatDownloads(selectedMod.downloadCount)}
            </span>
            <span className='text-muted-foreground'>downloads</span>
          </div>
          <div className='flex items-center gap-2'>
            <LuHeart className='h-4 w-4 text-red-500' />
            <span className='font-medium text-foreground'>
              {selectedMod.likes}
            </span>
            <span className='text-muted-foreground'>likes</span>
          </div>
          <Badge className='border-none bg-gradient-to-r from-[#EFE1BE] to-primary text-primary-foreground'>
            {selectedMod.category}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='relative space-y-6'>
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
          <h4 className='mb-2 font-semibold text-foreground'>
            What this mod does
          </h4>
          <div className='text-muted-foreground leading-relaxed'>
            <Interweave
              content={`${selectedMod.description?.slice(0, 250) ?? "No Description"}...`}
              tagName='div'
            />
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Link to='/download'>
            <Button className='h-12 w-full font-semibold text-lg shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-300 disabled:opacity-50'>
              <div className='flex items-center gap-2'>
                <LuDownload className='h-5 w-5' />
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
