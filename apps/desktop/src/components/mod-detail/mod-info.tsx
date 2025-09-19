import type { ModDto } from "@deadlock-mods/utils";
import { format } from "date-fns";
import { Calendar, Download, Hash, InfoIcon, Tag, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePersistedStore } from "@/lib/store";

interface ModInfoProps {
  mod: ModDto;
  hasHero?: boolean;
}

export const ModInfo = ({ mod, hasHero = false }: ModInfoProps) => {
  const showHeader = hasHero ? false : !mod.isAudio;
  const { localMods } = usePersistedStore();
  const localMod = localMods.find((m) => m.remoteId === mod.remoteId);

  return (
    <>
      {showHeader && (
        <CardHeader>
          <CardTitle className='text-3xl'>{mod.name}</CardTitle>
          <CardDescription>{mod.category}</CardDescription>
        </CardHeader>
      )}

      <CardContent className={hasHero || mod.isAudio ? "" : "pt-6"}>
        <div className='space-y-4'>
          <div className='grid grid-cols-3 gap-4'>
            <div className='flex items-center gap-2'>
              <Hash className='text-muted-foreground' />
              <span className='text-sm'>ID: {mod.remoteId}</span>
            </div>
            <div className='flex items-center gap-2'>
              <User className='text-muted-foreground' />
              <span className='text-sm'>Author: {mod.author}</span>
            </div>
            <div className='flex items-center gap-2'>
              <Calendar className='text-muted-foreground' />
              <span className='text-sm'>
                Added: {format(new Date(mod.remoteAddedAt), "PPP")}
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Calendar className='text-muted-foreground' />
              <span className='text-sm'>
                Updated: {format(new Date(mod.remoteUpdatedAt), "PPP")}
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Download className='text-muted-foreground' />
              <span className='text-sm'>Downloads: {mod.downloadCount}</span>
            </div>
            <div className='flex items-center gap-2'>
              <InfoIcon className='text-muted-foreground' />
              <span className='text-sm'>
                Mod Status: {localMod?.status ?? "-"}
              </span>
            </div>
          </div>

          {mod.tags && mod.tags.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
              <Tag className='text-muted-foreground' />
              {mod.tags.map((tag) => (
                <Badge key={tag} variant='secondary'>
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </>
  );
};
