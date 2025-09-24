import { Trash } from "@phosphor-icons/react";
import {
  ArrowUpDown,
  LayoutGrid,
  LayoutList,
  Loader2,
  Search,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import ModButton from "@/components/mod-browsing/mod-button";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { ModContextMenu } from "@/components/mod-management/mod-context-menu";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { AnalyzeAddonsButton } from "@/components/my-mods/analyze-addons-button";
import { MyModsEmptyState } from "@/components/my-mods/empty-state";
import { ModOrderingDialog } from "@/components/my-mods/mod-ordering-dialog";
import ErrorBoundary from "@/components/shared/error-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useSearch } from "@/hooks/use-search";
import useUninstall from "@/hooks/use-uninstall";
import { usePersistedStore } from "@/lib/store";
import { cn, isModOutdated } from "@/lib/utils";
import { type LocalMod, ModStatus } from "@/types/mods";

enum ViewMode {
  GRID = "grid",
  LIST = "list",
}

const GridModCard = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModContextMenu mod={mod}>
      <Card className='shadow'>
        <div className={cn("relative", isDisabled && "grayscale")}>
          <div
            className='cursor-pointer'
            onClick={() =>
              mod.id?.includes("local")
                ? toast.info(
                    "Local mod cannot be previewed (this is temporary)",
                  )
                : navigate(`/mods/${mod.remoteId}`)
            }>
            {mod.isAudio ? (
              <AudioPlayerPreview
                audioUrl={mod.audioUrl || ""}
                onPlayClick={(e) => e.stopPropagation()}
                variant='default'
              />
            ) : mod.images && mod.images.length > 0 ? (
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
              <div className='flex h-48 w-full items-center justify-center rounded-t-xl bg-secondary'>
                <div className='text-center text-foreground/60'>
                  <div className='mx-auto mb-2 h-12 w-12' />
                  <p className='text-sm'>No preview available</p>
                </div>
              </div>
            )}
          </div>
          <div className='absolute top-2 right-2 flex flex-col gap-1'>
            {mod.isAudio && <Badge variant='secondary'>Audio</Badge>}
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge
                variant='outline'
                className='bg-background/80 backdrop-blur-sm'>
                Custom
              </Badge>
            )}
            {isModOutdated(mod) && <OutdatedModWarning variant='indicator' />}
          </div>
          {mod.status === ModStatus.Installing && (
            <div className='absolute inset-0 flex items-center justify-center rounded-t-xl bg-black/50'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
            </div>
          )}
        </div>
        <CardHeader className='px-3 py-3 pb-0'>
          <div className='flex items-start'>
            <div className='flex flex-col'>
              <CardTitle
                className='w-48 cursor-pointer overflow-clip text-ellipsis text-nowrap'
                onClick={() => navigate(`/mods/${mod.remoteId}`)}
                title={mod.name}>
                {mod.name}
              </CardTitle>
              <CardDescription
                className='w-48 overflow-clip text-ellipsis text-nowrap'
                title={mod.author}>
                {t("mods.by")} {mod.author}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardFooter className='flex justify-between px-3 py-3 pt-2'>
          <ModButton remoteMod={mod} variant='iconOnly' />{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                isLoading={deleting}
                onClick={deleteMod}
                size='icon'
                variant='destructive'>
                <Trash className='h-4 w-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("mods.removeMod")}</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>
    </ModContextMenu>
  );
};

const ListModCard = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const isInstalling = mod.status === ModStatus.Installing;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModContextMenu mod={mod}>
      <Card className='shadow'>
        <div className='flex items-center pr-4'>
          <div
            className={cn(
              "relative h-24 w-24 min-w-24",
              isDisabled && "grayscale",
            )}
            onClick={() => navigate(`/mods/${mod.remoteId}`)}>
            {mod.isAudio ? (
              <AudioPlayerPreview
                audioUrl={mod.audioUrl || ""}
                onPlayClick={(e) => e.stopPropagation()}
                variant='compact'
              />
            ) : mod.images && mod.images.length > 0 ? (
              <NSFWBlur
                blurStrength={nsfwSettings.blurStrength}
                className='h-full w-full cursor-pointer overflow-hidden rounded-l-xl'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={shouldBlur}
                onToggleVisibility={handleNSFWToggle}>
                <img
                  alt={mod.name}
                  className='h-full w-full object-cover'
                  height='160'
                  src={mod.images[0]}
                  width='160'
                />
              </NSFWBlur>
            ) : (
              <div className='flex h-full w-full cursor-pointer items-center justify-center rounded-l-xl bg-secondary'>
                <div className='text-center text-foreground/60'>
                  <div className='mx-auto h-6 w-6' />
                </div>
              </div>
            )}
            <div className='absolute top-1 right-1 flex flex-col gap-1'>
              {mod.isAudio && (
                <Badge className='text-xs' variant='secondary'>
                  Audio
                </Badge>
              )}
              {mod.remoteUrl?.startsWith("local://") && (
                <Badge
                  variant='outline'
                  className='text-xs bg-background/80 backdrop-blur-sm'>
                  Custom
                </Badge>
              )}
              {isModOutdated(mod) && (
                <OutdatedModWarning className='text-xs' variant='indicator' />
              )}
            </div>
            {mod.status === ModStatus.Installing && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            )}
          </div>
          <div className='flex w-full flex-col justify-between p-3'>
            <div>
              <h3
                className='cursor-pointer font-semibold text-lg'
                onClick={() => navigate(`/mods/${mod.remoteId}`)}>
                {mod.name}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t("mods.by")} {mod.author}{" "}
                {mod.isAudio && `• ${t("mods.audioMod")}`}
              </p>
            </div>
          </div>

          <div className='flex flex-col items-center gap-2'>
            <ModButton remoteMod={mod} variant='iconOnly' />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isInstalling || deleting}
                  isLoading={deleting}
                  onClick={deleteMod}
                  size='icon'
                  variant='destructive'>
                  <Trash className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("mods.removeMod")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Card>
    </ModContextMenu>
  );
};

const SimpleSearchBar = ({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className='relative w-full max-w-sm'>
      <Search className='absolute top-2.5 left-2 h-4 w-4 text-muted-foreground' />
      <Input
        className='pl-8'
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("mods.searchPlaceholder")}
        value={query}
      />
    </div>
  );
};

const MyMods = () => {
  const { t } = useTranslation();
  const mods = usePersistedStore((state) => state.localMods);
  const getOrderedMods = usePersistedStore((state) => state.getOrderedMods);
  const getEnabledModsCount = usePersistedStore(
    (state) => state.getEnabledModsCount,
  );
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);

  const { results, query, setQuery } = useSearch({
    data: mods,
    keys: ["name", "description", "author"],
  });

  const displayMods = query.trim()
    ? results
    : [...mods].sort((a, b) => {
        const aIsInstalled =
          a.status === ModStatus.Installed &&
          a.installedVpks &&
          a.installedVpks.length > 0;
        const bIsInstalled =
          b.status === ModStatus.Installed &&
          b.installedVpks &&
          b.installedVpks.length > 0;

        if (aIsInstalled && !bIsInstalled) return -1;
        if (!aIsInstalled && bIsInstalled) return 1;

        if (aIsInstalled && bIsInstalled) {
          const aOrder = a.installOrder ?? 999;
          const bOrder = b.installOrder ?? 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
        }

        const dateA = a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0;
        const dateB = b.downloadedAt ? new Date(b.downloadedAt).getTime() : 0;
        return dateB - dateA;
      });

  const installedMods = getOrderedMods();

  const enabledModsCount = getEnabledModsCount();

  return (
    <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full gap-4 overflow-y-auto px-4'>
      <div className='mb-8'>
        <div className='flex items-baseline gap-3'>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t("navigation.myMods")}
          </h1>
          {mods.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "text-sm font-medium cursor-help",
                    enabledModsCount >= 99
                      ? "text-destructive"
                      : enabledModsCount >= 85
                        ? "text-orange-600"
                        : "text-muted-foreground",
                  )}>
                  ({enabledModsCount}/99)
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("myMods.modLimitTooltip")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className='text-muted-foreground mt-2'>{t("myMods.subtitle")}</p>
      </div>
      <ErrorBoundary>
        {mods.length === 0 ? (
          <MyModsEmptyState />
        ) : (
          <div className='flex flex-col gap-4'>
            <div className='flex items-center justify-between'>
              <SimpleSearchBar query={query} setQuery={setQuery} />
              <div className='flex items-center gap-2'>
                <AnalyzeAddonsButton />
                <ModOrderingDialog>
                  <Button
                    size='icon'
                    variant='outline'
                    disabled={installedMods.length === 0}>
                    <ArrowUpDown className='h-4 w-4' />
                  </Button>
                </ModOrderingDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setViewMode(ViewMode.GRID)}
                      size='icon'
                      variant={
                        viewMode === ViewMode.GRID ? "default" : "outline"
                      }>
                      <LayoutGrid className='h-4 w-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("mods.gridView")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setViewMode(ViewMode.LIST)}
                      size='icon'
                      variant={
                        viewMode === ViewMode.LIST ? "default" : "outline"
                      }>
                      <LayoutList className='h-4 w-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("mods.listView")}</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {viewMode === ViewMode.GRID ? (
              <div className='grid grid-cols-4 gap-4'>
                {displayMods.map((mod) => (
                  <GridModCard key={mod.remoteId} mod={mod} />
                ))}
              </div>
            ) : (
              <div className='flex flex-col gap-3'>
                {displayMods.map((mod) => (
                  <ListModCard key={mod.remoteId} mod={mod} />
                ))}
              </div>
            )}
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default MyMods;
