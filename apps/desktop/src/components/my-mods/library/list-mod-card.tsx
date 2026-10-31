import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
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
import { getErrorMessage } from "@/lib/errors";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { showsDateOutdatedWarning } from "@/lib/mods/mod-health";
import { cn, isModOutdated } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import type { ModCardProps } from "@/components/my-mods/library/library-types";
import { LazyModOptionsDialog } from "@/components/my-mods/library/lazy-mod-options-dialog";

export const ListModCard = memo(function ListModCard({
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
  const isInstalling = mod.status === ModStatus.Installing;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);
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

  return (
    <>
      <ModContextMenu
        hint={contextMenuHint}
        mod={mod}
        onSelect={() => onSelect(mod.remoteId)}
        selected={selected}>
        <Card className='group/row flex items-center gap-4 overflow-hidden pr-3 shadow transition-colors hover:bg-muted/40'>
          <div
            className={cn(
              "relative h-16 w-28 shrink-0 transition-[filter] duration-300 ease-out",
              isDisabled && "grayscale",
            )}
            onClick={openModDetail}>
            {mod.isAudio ? (
              <AudioPlayerPreview
                audioUrl={mod.audioUrl || ""}
                onPlayClick={(e) => e.stopPropagation()}
                variant='compact'
              />
            ) : mod.images && mod.images.length > 0 ? (
              <NSFWBlur
                blurStrength={nsfwSettings.blurStrength}
                className='h-full w-full cursor-pointer overflow-hidden'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={shouldBlur}
                onToggleVisibility={handleNSFWToggle}>
                <img
                  alt={mod.name}
                  className='h-full w-full object-cover transition-transform duration-300 ease-out group-hover/row:scale-105'
                  decoding='async'
                  height='160'
                  loading='lazy'
                  src={getModCoverImage(mod)}
                  width='160'
                />
              </NSFWBlur>
            ) : (
              <div className='h-full w-full cursor-pointer bg-secondary' />
            )}
            {mod.status === ModStatus.Installing && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            )}
          </div>

          <div className='min-w-0 flex-1 py-2'>
            <h3
              className={cn(
                "cursor-pointer truncate font-semibold transition-colors",
                isDisabled && "text-muted-foreground",
              )}
              onClick={openModDetail}
              title={mod.name}>
              {mod.name}
            </h3>
            <p className='truncate text-muted-foreground text-sm'>
              <LibraryModAuthor mod={mod} />{" "}
              {mod.isAudio && `• ${t("mods.audioMod")}`}
            </p>
          </div>

          <div className='flex min-w-0 flex-wrap items-center justify-end gap-1 empty:hidden'>
            <ModUpdateBadge
              mod={mod}
              hasUpdate={hasUpdate}
              className='text-xs'
            />
            <ModHealthBadge
              className='text-xs'
              health={health}
              isOutdated={isModOutdated(mod)}
            />
            {showsDateOutdatedWarning(isModOutdated(mod), health) && (
              <OutdatedModWarning className='text-xs' variant='indicator' />
            )}
            <MissingFilesWarning
              className='text-xs'
              missingVpks={mod.missingVpks}
            />
            <RequirementWarning mod={mod} />
            <CrashSuspectBadge modId={mod.remoteId} />
            {conflictStatus && (
              <ModConflictBadge
                className='text-xs'
                onClick={onShowConflicts}
                status={conflictStatus}
              />
            )}
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge variant='outline' className='text-xs'>
                {t("mods.customBadge")}
              </Badge>
            )}
          </div>

          <div className='flex shrink-0 items-center gap-1'>
            {modOptions.showButton && (
              <ModOptionsButton
                activeCount={modOptions.activeVariantCount}
                onOpen={modOptions.open}
              />
            )}
            <ModButton remoteMod={mod} variant='iconOnly' />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("mods.removeMod")}
                  disabled={isInstalling || deleting}
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
        </Card>
      </ModContextMenu>
      <LazyModOptionsDialog modName={mod.name} modOptions={modOptions} />
    </>
  );
});
