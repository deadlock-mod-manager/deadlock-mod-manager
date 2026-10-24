import {
  formatByteSize,
  type ProfileBackupSummary,
} from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deadlock-mods/ui/components/radio-group";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  DesktopTowerIcon,
  DownloadSimpleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type RestoreDestination,
  useRestoreProfileBackup,
} from "@/hooks/use-restore-profile-backup";
import { getMod, getProfileBackup } from "@/lib/api-client";
import {
  getProfileModCandidateIds,
  rewriteProfileIdentities,
} from "@/lib/profiles/import-profile-shared";
import { usePersistedStore } from "@/lib/store";
import { RestoreProgress, type RestoreProgressMod } from "./restore-progress";

interface RestoreBackupDialogProps {
  backup: ProfileBackupSummary | null;
  defaultDestination?: RestoreDestination;
  onOpenChange: (open: boolean) => void;
}

export const RestoreBackupDialog = ({
  backup,
  defaultDestination = "new",
  onOpenChange,
}: RestoreBackupDialogProps) => {
  const { t } = useTranslation();
  const activeProfile = usePersistedStore((state) => state.getActiveProfile());
  const [destination, setDestination] =
    useState<RestoreDestination>(defaultDestination);
  const { restore, importProgress } = useRestoreProfileBackup();

  const backupQuery = useQuery({
    queryKey: ["profile-backup", backup?.id, backup?.revision],
    queryFn: () => getProfileBackup(backup?.id ?? ""),
    enabled: !!backup,
  });
  const full = backupQuery.data;
  const profile = full?.payload.profile;

  // Backups are written in the current format, so each mod has one identity.
  const resolvedIds = profile
    ? profile.payload.mods.map(
        (mod, index) =>
          getProfileModCandidateIds(profile, index)[0] ?? mod.remoteId,
      )
    : [];
  const modQueries = useQueries({
    queries: resolvedIds.map((remoteId) => ({
      queryKey: ["mod", remoteId],
      queryFn: () => getMod(remoteId),
      retry: false,
    })),
  });

  const modsLoading =
    backupQuery.isLoading || modQueries.some((query) => query.isPending);
  const modsData = modQueries.flatMap((query) =>
    query.data ? [query.data] : [],
  );
  const unavailable = profile
    ? profile.payload.mods.filter((_, index) => modQueries[index]?.isError)
    : [];
  const progressMods: RestoreProgressMod[] = profile
    ? profile.payload.mods.flatMap((mod, index) => {
        const data = modQueries[index]?.data;
        return data
          ? [
              {
                mod: data,
                bytes: (mod.selectedDownloads ?? []).reduce(
                  (sum, download) => sum + download.size,
                  0,
                ),
              },
            ]
          : [];
      })
    : [];
  const downloadBytes = progressMods.reduce((sum, { bytes }) => sum + bytes, 0);
  const availableCount = resolvedIds.length - unavailable.length;
  const disabledCount = full?.payload.disabledModIds.length ?? 0;
  const modName = (remoteId: string) =>
    full?.payload.modNames?.[remoteId] ?? remoteId;

  const isRestoring = restore.isPending;
  const canRestore =
    !!profile && !modsLoading && availableCount > 0 && !isRestoring;

  const handleRestore = () => {
    if (!full || !profile) return;
    restore.mutate(
      {
        backup: full,
        profile: rewriteProfileIdentities(profile, resolvedIds),
        modsData,
        destination,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog
      open={!!backup}
      onOpenChange={(open) => !isRestoring && onOpenChange(open)}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <DownloadSimpleIcon className='size-5 text-primary' />
            {t("cloudBackup.restoreTitle", { name: backup?.name })}
          </DialogTitle>
          <DialogDescription className='space-y-1'>
            {backup && (
              <span className='flex items-center gap-1.5 text-xs'>
                <DesktopTowerIcon aria-hidden className='size-3.5' />
                {t("cloudBackup.restoreSource", {
                  device: backup.deviceName || t("cloudBackup.unknownDevice"),
                  date: format(new Date(backup.updatedAt), "PP"),
                })}
              </span>
            )}
            <span className='block'>{t("cloudBackup.restoreDescription")}</span>
          </DialogDescription>
        </DialogHeader>

        {isRestoring ? (
          <RestoreProgress progress={importProgress} mods={progressMods} />
        ) : modsLoading ? (
          <div className='space-y-3'>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-24 w-full' />
          </div>
        ) : (
          <div className='space-y-4'>
            <dl className='grid grid-cols-2 divide-x rounded-lg border bg-card'>
              <div className='px-4 py-3'>
                <dd className='font-mono text-xl font-semibold'>
                  {availableCount}
                </dd>
                <dt className='text-xs text-muted-foreground'>
                  {t("cloudBackup.modsToDownload", { count: availableCount })}
                </dt>
              </div>
              <div className='px-4 py-3'>
                <dd className='font-mono text-xl font-semibold'>
                  {formatByteSize(downloadBytes)}
                </dd>
                <dt className='text-xs text-muted-foreground'>
                  {t("cloudBackup.estimatedDownload")}
                </dt>
              </div>
            </dl>

            {unavailable.length > 0 && (
              <details
                open
                className='rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm'>
                <summary className='flex cursor-pointer items-center gap-2 font-medium text-amber-500'>
                  <WarningIcon aria-hidden className='size-4 shrink-0' />
                  {t("cloudBackup.unavailableMods", {
                    count: unavailable.length,
                  })}
                </summary>
                <ul className='mt-2 space-y-1 pl-6'>
                  {unavailable.map((mod) => (
                    <li key={mod.remoteId}>{modName(mod.remoteId)}</li>
                  ))}
                </ul>
              </details>
            )}

            {disabledCount > 0 && (
              <p className='text-xs text-muted-foreground'>
                {t("cloudBackup.disabledNotRestored", { count: disabledCount })}
              </p>
            )}

            <div className='space-y-2'>
              <p className='text-xs font-semibold text-muted-foreground'>
                {t("cloudBackup.restoreTo")}
              </p>
              <RadioGroup
                value={destination}
                onValueChange={(value) =>
                  setDestination(value as RestoreDestination)
                }>
                {(
                  [
                    {
                      value: "new",
                      title: t("cloudBackup.restoreAsNew"),
                      description: t("cloudBackup.restoreAsNewDescription", {
                        name: backup?.name,
                      }),
                    },
                    {
                      value: "replace",
                      title: t("cloudBackup.restoreReplace", {
                        name: activeProfile?.name,
                      }),
                      description: t("cloudBackup.restoreReplaceDescription", {
                        name: activeProfile?.name,
                      }),
                    },
                  ] as const
                ).map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`restore-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
                      destination === option.value &&
                        "border-primary/40 bg-muted/40",
                    )}>
                    <RadioGroupItem
                      id={`restore-${option.value}`}
                      value={option.value}
                      className='mt-0.5'
                    />
                    <span className='space-y-0.5'>
                      <span className='block text-sm font-medium'>
                        {option.title}
                      </span>
                      <span
                        className={cn(
                          "block text-xs",
                          option.value === "replace"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}>
                        {option.description}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant='ghost'
            disabled={isRestoring}
            onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!canRestore}
            isLoading={isRestoring}
            icon={<DownloadSimpleIcon className='size-4' />}
            onClick={handleRestore}>
            {isRestoring
              ? t("cloudBackup.restoring")
              : t("cloudBackup.restoreAction", { count: availableCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
