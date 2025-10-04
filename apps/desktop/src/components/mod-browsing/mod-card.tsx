import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { CalendarIcon, DownloadIcon, HeartIcon } from "@deadlock-mods/ui/icons";
import { format } from "date-fns";
import { useNavigate } from "react-router";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { ReportCounter } from "@/components/reports/report-counter";
import ModCardSkeleton from "@/components/skeletons/mod-card";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { usePersistedStore } from "@/lib/store";
import { isModOutdated } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import ModButton from "./mod-button";
import NSFWBlur from "./nsfw-blur";

const ModCard = ({ mod }: { mod?: ModDto }) => {
  const { localMods, setScrollPosition } = usePersistedStore();
  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const status = localMod?.status;
  const navigate = useNavigate();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);
  const { saveScrollPosition } = useScrollPosition("/mods");

  if (!mod) {
    return <ModCardSkeleton />;
  }

  return (
    <Card
      className='cursor-pointer shadow'
      onClick={(e) => {
        e.stopPropagation();
        const scrollContainer = (e.currentTarget as HTMLElement).closest(
          ".overflow-auto",
        );
        if (scrollContainer) {
          const scrollTop = scrollContainer.scrollTop;
          setScrollPosition("/mods", scrollTop);
        } else {
          saveScrollPosition();
        }

        navigate(`/mods/${mod.remoteId}`);
      }}>
      <div className='relative'>
        {mod.isAudio ? (
          <AudioPlayerPreview
            audioUrl={mod.audioUrl || ""}
            onPlayClick={(e) => e.stopPropagation()}
            variant='default'
          />
        ) : mod.images.length > 0 ? (
          <NSFWBlur
            blurStrength={nsfwSettings.blurStrength}
            className='h-48 w-full overflow-hidden rounded-t-xl'
            disableBlur={nsfwSettings.disableBlur}
            isNSFW={shouldBlur}
            onToggleVisibility={handleNSFWToggle}>
            <img
              alt={mod.name}
              className='h-48 w-full object-cover'
              height='192'
              src={mod.images[0]}
              width='320'
            />
          </NSFWBlur>
        ) : (
          // Fallback for mods without images or audio
          <div className='flex h-48 w-full items-center justify-center rounded-t-xl bg-muted'>
            <div className='text-center text-muted-foreground'>
              <DownloadIcon className='mx-auto mb-2 h-12 w-12' />
              <p className='text-sm'>No preview available</p>
            </div>
          </div>
        )}
        <div className='absolute top-2 right-2 flex flex-col gap-1'>
          {mod.isAudio && <Badge variant='secondary'>Audio</Badge>}
          {status === ModStatus.Installed && <Badge>Installed</Badge>}
          {isModOutdated(mod) && <OutdatedModWarning variant='indicator' />}
          <ReportCounter modId={mod.id} variant='indicator' />
        </div>
      </div>
      <CardHeader className='px-3 py-4'>
        <div className='flex items-start justify-between'>
          <div className='flex w-full flex-col gap-3'>
            <div className='space-y-1'>
              <CardTitle
                className='overflow-clip text-ellipsis text-nowrap leading-tight'
                title={mod.name}>
                {mod.name}
              </CardTitle>
              <CardDescription
                className='overflow-clip text-ellipsis text-nowrap'
                title={mod.author}>
                By {mod.author}
              </CardDescription>
            </div>

            <div className='flex flex-row justify-between'>
              <div className='flex flex-col gap-1.5'>
                <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                  <div className='flex items-center gap-1.5'>
                    <DownloadIcon className='h-3 w-3 flex-shrink-0' />
                    <span>{mod.downloadCount.toLocaleString()}</span>
                  </div>
                  {mod.likes > 0 && (
                    <div className='flex items-center gap-1.5'>
                      <HeartIcon className='ml-2 h-3 w-3 flex-shrink-0' />
                      <span>{mod.likes.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                  <CalendarIcon className='h-3 w-3 flex-shrink-0' />
                  <span title={format(new Date(mod.remoteUpdatedAt), "PPP")}>
                    {format(new Date(mod.remoteUpdatedAt), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              <ModButton remoteMod={mod} variant='iconOnly' />
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export default ModCard;
