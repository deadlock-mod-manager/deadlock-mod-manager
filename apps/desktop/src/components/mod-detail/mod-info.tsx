import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Calendar,
  Download,
  Hash,
  InfoIcon,
  Tag,
  User,
} from "@deadlock-mods/ui/icons";
import { usePersistedStore } from "@/lib/store";
import { DateDisplay } from "../date-display";

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
                Published At: <DateDisplay date={mod.remoteAddedAt} inverse />
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Calendar className='text-muted-foreground' />
              <span className='text-sm'>
                Last Modified At:{" "}
                <DateDisplay date={mod.remoteUpdatedAt} inverse />
              </span>
            </div>
            {localMod?.downloadedAt != null && (
              <div className='flex items-center gap-2'>
                <Calendar className='text-muted-foreground' />
                <span className='text-sm'>
                  Installed At:{" "}
                  <DateDisplay date={localMod.downloadedAt} inverse />
                </span>
              </div>
            )}
            <div className='flex items-center gap-2'>
              <Download className='text-muted-foreground' />
              <span className='text-sm'>Downloads: {mod.downloadCount}</span>
            </div>
            {localMod?.status && (
              <div className='flex items-center gap-2'>
                <InfoIcon className='text-muted-foreground' />
                <span className='text-sm'>Mod Status: {localMod?.status}</span>
              </div>
            )}
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
