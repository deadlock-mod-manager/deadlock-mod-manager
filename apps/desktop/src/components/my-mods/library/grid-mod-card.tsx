import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Loader2 } from "@deadlock-mods/ui/icons";
import { Trash } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import ModButton from "@/components/mod-browsing/mod-button";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { ModContextMenu } from "@/components/mod-management/mod-context-menu";
import { ModOptionsButton } from "@/components/mod-management/mod-options-button";
import { MissingFilesWarning } from "@/components/mod-management/missing-files-warning";
import { RequirementWarning } from "@/components/my-mods/requirement-warning";
import { CrashSuspectBadge } from "@/components/my-mods/crash-suspect-badge";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { ModConflictBadge } from "@/components/my-mods/conflicts/mod-conflict-badge";
import { LibraryModAuthor } from "@/components/my-mods/library-mod-author";
import { ModHealthBadge } from "@/components/mod-health/mod-health-badge";
import { ModUpdateBadge } from "@/components/mod-management/mod-update-badges";
import { useModHasUpdate } from "@/hooks/use-check-updates";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useModOptions } from "@/hooks/use-mod-options";
import useUninstall from "@/hooks/use-uninstall";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { getErrorMessage } from "@/lib/errors";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { showsDateOutdatedWarning } from "@/lib/mods/mod-health";
import { cn, isModOutdated } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import type { ModCardProps } from "@/components/my-mods/library/library-types";
import { LazyModOptionsDialog } from "@/components/my-mods/library/lazy-mod-options-dialog";

export const GridModCard = memo(function GridModCard({
  mod,
  conflictStatus,
  onShowConflicts,
  health,
  contextMenuHint,
  onSelect,
  selected,
}: ModCardProps) {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const hasUpdate = useModHasUpdate(mod);
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);
  const CardWrapper = useThemeOverride("cardWrapper");
  const modOptions = useModOptions(mod);

  const openModDetail = () =>
    navigate(`/mods/${mod.remoteId}`, {
      state: { collection: "library" },
    });

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${getErrorMessage(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const cardContent = (
    <ModContextMenu
      hint={contextMenuHint}
      mod={mod}
      onSelect={() => onSelect(mod.remoteId)}
      selected={selected}>
      <Card className='flex h-full flex-col shadow'>
        <div className='relative'>
          <div
            className={cn("cursor-pointer", isDisabled && "grayscale")}
            onClick={openModDetail}>
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
                  decoding='async'
                  height='192'
                  loading='lazy'
                  src={getModCoverImage(mod)}
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
          <div className='absolute bottom-2 left-2'>
            <ModUpdateBadge mod={mod} hasUpdate={hasUpdate} />
          </div>
          <div className='absolute top-2 right-2 flex flex-col gap-1'>
            {mod.isAudio && (
              <Badge variant='secondary'>{t("mods.audio")}</Badge>
            )}
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge variant='outline' className='bg-background/95'>
                {t("mods.customBadge")}
              </Badge>
            )}
            {showsDateOutdatedWarning(isModOutdated(mod), health) && (
              <OutdatedModWarning variant='indicator' />
            )}
            <ModHealthBadge health={health} isOutdated={isModOutdated(mod)} />
            <MissingFilesWarning missingVpks={mod.missingVpks} />
            <RequirementWarning mod={mod} />
            <CrashSuspectBadge modId={mod.remoteId} />
            {conflictStatus && (
              <ModConflictBadge
                onClick={onShowConflicts}
                status={conflictStatus}
              />
            )}
          </div>
          {mod.status === ModStatus.Installing && (
            <div className='absolute inset-0 flex items-center justify-center rounded-t-xl bg-black/50'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
            </div>
          )}
        </div>
        <CardHeader className='space-y-1 px-3 py-3 pb-0'>
          <CardTitle
            className='line-clamp-2 cursor-pointer leading-tight'
            onClick={openModDetail}
            title={mod.name}>
            {mod.name}
          </CardTitle>
          <CardDescription className='truncate' title={mod.author}>
            <LibraryModAuthor mod={mod} />
          </CardDescription>
        </CardHeader>
        <CardFooter className='mt-auto justify-between gap-3 px-3 py-3 pt-2'>
          <div className='flex min-w-0 items-center gap-1'>
            {modOptions.showButton ? (
              <ModOptionsButton
                activeCount={modOptions.activeVariantCount}
                onOpen={modOptions.open}
                className='shrink-0'
              />
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("mods.removeMod")}
                  icon={<Trash className='h-4 w-4' />}
                  isLoading={deleting}
                  onClick={deleteMod}
                  size='icon'
                  variant='destructiveGhost'
                />
              </TooltipTrigger>
              <TooltipContent>{t("mods.removeMod")}</TooltipContent>
            </Tooltip>
          </div>
          <ModButton remoteMod={mod} variant='iconOnly' />
        </CardFooter>
      </Card>
    </ModContextMenu>
  );

  return (
    <>
      {CardWrapper ? <CardWrapper>{cardContent}</CardWrapper> : cardContent}
      <LazyModOptionsDialog modName={mod.name} modOptions={modOptions} />
    </>
  );
});
