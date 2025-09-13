import type { ModDto } from '@deadlock-mods/utils';
import { format } from 'date-fns';
import { Calendar, Download, Hash, Tag, User } from 'lucide-react';
import ModButton from '@/components/mod-browsing/mod-button';
import { Badge } from '@/components/ui/badge';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface ModInfoProps {
  mod: ModDto;
  hasHero?: boolean;
}

export const ModInfo = ({ mod, hasHero = false }: ModInfoProps) => {
  const showHeader = hasHero ? false : !mod.isAudio;

  return (
    <div className="z-20 grid grid-cols-1 gap-6 bg-card md:grid-cols-3">
      <div className="md:col-span-2">
        {showHeader && (
          <CardHeader>
            <CardTitle className="text-3xl">{mod.name}</CardTitle>
            <CardDescription>{mod.category}</CardDescription>
          </CardHeader>
        )}

        <CardContent className={hasHero || mod.isAudio ? '' : 'pt-6'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Hash className="text-muted-foreground" />
                <span className="text-sm">ID: {mod.remoteId}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="text-muted-foreground" />
                <span className="text-sm">Author: {mod.author}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="text-muted-foreground" />
                <span className="text-sm">
                  Added: {format(new Date(mod.remoteAddedAt), 'PPP')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="text-muted-foreground" />
                <span className="text-sm">
                  Updated: {format(new Date(mod.remoteUpdatedAt), 'PPP')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="text-muted-foreground" />
                <span className="text-sm">Downloads: {mod.downloadCount}</span>
              </div>
            </div>

            {mod.tags && mod.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="text-muted-foreground" />
                {mod.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </div>

      <div>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <ModButton remoteMod={mod} variant="default" />
          </div>
        </CardContent>
      </div>
    </div>
  );
};
