import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { PowerOff, RefreshCw, Undo2, Wrench, X } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { useCheckUpdates } from "@/hooks/use-check-updates";
import {
  useFixMods,
  useGameRunning,
  useModHealthReport,
  useRestoreOriginalFiles,
} from "@/hooks/use-mod-health";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import useUninstall from "@/hooks/use-uninstall";
import {
  canFixInBulk,
  healthAction,
  healthBadgeKind,
  healthByModId,
  type ModHealthBadgeKind,
} from "@/lib/mods/mod-health";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { usePersistedStore } from "@/lib/store";
import { isModOutdated } from "@/lib/utils";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthSymptom } from "@/types/generated/ModHealthSymptom";
import { type LocalMod, ModStatus } from "@/types/mods";

const ROW_ORDER = {
  fixable: 0,
  partlyFixable: 1,
  needsUpdate: 2,
  originalFiles: 3,
  partlyFixed: 4,
  fixed: 5,
} satisfies Record<ModHealthBadgeKind, number>;

type HealthRow = {
  mod: LocalMod;
  health: ModHealth;
  kind: ModHealthBadgeKind;
};

const SymptomChips = ({
  label,
  symptoms,
}: {
  label?: string;
  symptoms: readonly ModHealthSymptom[];
}) => {
  const { t } = useTranslation();
  if (symptoms.length === 0) return null;
  return (
    <div className='flex flex-wrap items-center gap-1'>
      {label ? (
        <span className='text-muted-foreground text-xs'>{label}</span>
      ) : null}
      {symptoms.map((symptom) => (
        <Badge
          key={symptom}
          variant='outline'
          className='font-normal text-muted-foreground text-xs'>
          {t(`modHealth.symptoms.${symptom}`)}
        </Badge>
      ))}
    </div>
  );
};

type UpdateCandidates = ReturnType<typeof useCheckUpdates>["updatableMods"];

const ModThumbnail = ({ mod }: { mod: LocalMod }) => {
  const { shouldBlur, nsfwSettings } = useNSFWBlur(mod);
  const cover = getModCoverImage(mod);
  if (!cover || (shouldBlur && !nsfwSettings.disableBlur)) {
    return <div className='h-10 w-10 shrink-0 rounded-md bg-secondary' />;
  }
  return (
    <img
      alt=''
      className='h-10 w-10 shrink-0 rounded-md bg-secondary object-cover'
      height='40'
      src={cover}
      width='40'
    />
  );
};

export const ModHealthDialog = ({
  open,
  onOpenChange,
  profileFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileFolder: string | null;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localMods = usePersistedStore((state) => state.localMods);
  const report = useModHealthReport(profileFolder);
  const gameRunning = useGameRunning();
  const fix = useFixMods();
  const restoreOriginal = useRestoreOriginalFiles();
  const { uninstall } = useUninstall();
  const { refetch: refetchUpdates } = useCheckUpdates();
  const [updates, setUpdates] = useState<UpdateCandidates>([]);

  const healthById = healthByModId(report.data);
  const rows: HealthRow[] = localMods
    .flatMap((mod) => {
      const health = healthById.get(mod.remoteId);
      const kind = healthBadgeKind(health);
      return health && kind ? [{ mod, health, kind }] : [];
    })
    .sort((a, b) => ROW_ORDER[a.kind] - ROW_ORDER[b.kind]);
  const fixableIds = rows
    .filter((row) => canFixInBulk(row.health))
    .map((row) => row.mod.remoteId);

  const disable = useMutation({
    mutationFn: (mod: LocalMod) => uninstall(mod, false),
  });

  const checkForUpdate = useMutation({
    mutationFn: async (mod: LocalMod) => {
      const result = await refetchUpdates();
      if (result.isError) throw result.error;
      return (
        result.data?.updates.filter(
          (update) => update.mod.remoteId === mod.remoteId,
        ) ?? []
      );
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (found, mod) => {
      if (found.length > 0) {
        setUpdates(found);
      } else {
        toast.info(t("modHealth.dialog.noUpdate", { name: mod.name }));
      }
    },
    onError: () => {
      toast.error(t("myMods.checkForUpdatesError"));
    },
  });

  const isFixing = (modId: string) =>
    fix.isPending && fix.variables?.modIds.includes(modId) === true;
  const isSwitching = (modId: string) =>
    restoreOriginal.isPending && restoreOriginal.variables?.modId === modId;
  const changesBlocked =
    gameRunning || fix.isPending || restoreOriginal.isPending;

  const openMod = (mod: LocalMod) => {
    onOpenChange(false);
    navigate(`/mods/${mod.remoteId}`, { state: { collection: "library" } });
  };

  const actions = ({ mod, kind }: HealthRow) => {
    switch (healthAction(kind)) {
      case "fix":
        return (
          <Button
            size='sm'
            disabled={changesBlocked}
            isLoading={isFixing(mod.remoteId)}
            icon={<Wrench className='h-4 w-4' />}
            onClick={() =>
              fix.mutate({ profileFolder, modIds: [mod.remoteId] })
            }>
            {t("modHealth.dialog.fix")}
          </Button>
        );
      case "useOriginalFiles":
        return (
          <Button
            size='sm'
            variant='outline'
            disabled={changesBlocked}
            isLoading={isSwitching(mod.remoteId)}
            icon={<Undo2 className='h-4 w-4' />}
            onClick={() =>
              restoreOriginal.mutate({
                profileFolder,
                modId: mod.remoteId,
                modName: mod.name,
              })
            }>
            {t("modHealth.useOriginalFiles")}
          </Button>
        );
      case null:
        return (
          <>
            <Button
              size='sm'
              variant='outline'
              disabled={checkForUpdate.isPending}
              isLoading={
                checkForUpdate.isPending &&
                checkForUpdate.variables?.remoteId === mod.remoteId
              }
              icon={<RefreshCw className='h-4 w-4' />}
              onClick={() => checkForUpdate.mutate(mod)}>
              {t("myMods.checkForUpdates")}
            </Button>
            {mod.status === ModStatus.Installed ? (
              <Button
                size='sm'
                variant='outline'
                disabled={disable.isPending}
                isLoading={
                  disable.isPending &&
                  disable.variables?.remoteId === mod.remoteId
                }
                icon={<PowerOff className='h-4 w-4' />}
                onClick={() => disable.mutate(mod)}>
                {t("modHealth.dialog.disable")}
              </Button>
            ) : null}
          </>
        );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='flex max-h-[82vh] max-w-2xl flex-col overflow-hidden'>
          <DialogHeader className='shrink-0 pr-8'>
            <DialogTitle>{t("modHealth.dialog.title")}</DialogTitle>
            <DialogDescription className='text-pretty'>
              {t("modHealth.dialog.disclaimer")}
            </DialogDescription>
            {gameRunning ? (
              <p className='text-muted-foreground text-sm'>
                {t("modHealth.closeGame")}
              </p>
            ) : null}
          </DialogHeader>
          <ul className='-mx-1 min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-1'>
            {rows.length === 0 ? (
              <li className='py-6 text-center text-muted-foreground text-sm'>
                {t("modHealth.dialog.empty")}
              </li>
            ) : null}
            {rows.map((row) => (
              <li
                key={row.mod.remoteId}
                className='flex flex-col gap-2 py-3 sm:flex-row sm:items-center'
                data-testid='mod-health-row'>
                <div className='flex min-w-0 flex-1 items-start gap-3'>
                  <ModThumbnail mod={row.mod} />
                  <div className='flex min-w-0 flex-col gap-1'>
                    <button
                      type='button'
                      className='truncate text-left font-medium text-sm hover:underline'
                      title={row.mod.name}
                      onClick={() => openMod(row.mod)}>
                      {row.mod.name}
                    </button>
                    <p className='text-muted-foreground text-xs'>
                      {t(`modHealth.badge.${row.kind}`)}
                      {isModOutdated(row.mod)
                        ? ` ${t("modHealth.lastUpdatedBefore")}`
                        : null}
                    </p>
                    {row.kind !== "needsUpdate" &&
                    row.health.remainingSymptoms.length > 0 ? (
                      <>
                        <SymptomChips
                          label={t("modHealth.dialog.fixes")}
                          symptoms={row.health.fixSymptoms}
                        />
                        <SymptomChips
                          label={t("modHealth.dialog.stillNeedsUpdate")}
                          symptoms={row.health.remainingSymptoms}
                        />
                      </>
                    ) : (
                      <SymptomChips
                        symptoms={
                          row.kind === "needsUpdate"
                            ? row.health.symptoms
                            : row.health.fixSymptoms
                        }
                      />
                    )}
                  </div>
                </div>
                <div className='flex shrink-0 flex-wrap items-center gap-2 pl-13 sm:pl-0'>
                  {actions(row)}
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className='shrink-0 border-t pt-4'>
            <Button
              variant='outline'
              icon={<X className='h-4 w-4' />}
              onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            {fixableIds.length > 0 ? (
              <Button
                disabled={changesBlocked}
                isLoading={
                  fix.isPending &&
                  fix.variables?.modIds.length === fixableIds.length
                }
                icon={<Wrench className='h-4 w-4' />}
                onClick={() =>
                  fix.mutate({ profileFolder, modIds: fixableIds })
                }>
                {t("modHealth.dialog.fixAll")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BatchUpdateDialog
        isSingleMod
        open={updates.length > 0}
        onOpenChange={(next) => {
          if (!next) setUpdates([]);
        }}
        updates={updates}
      />
    </>
  );
};
