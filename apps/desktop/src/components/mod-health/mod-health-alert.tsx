import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Check,
  Clock,
  FileArchive,
  Undo2,
  Wrench,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  useActiveProfileFolder,
  useFixMods,
  useGameRunning,
  useRestoreOriginalFiles,
} from "@/hooks/use-mod-health";
import { healthAction, healthBadgeKind } from "@/lib/mods/mod-health";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { LocalMod } from "@/types/mods";
import { ModHealthSummary } from "./mod-health-badge";

export const ModHealthAlert = ({
  mod,
  health,
  isOutdated,
  className,
}: {
  mod: LocalMod;
  health: ModHealth | undefined;
  isOutdated: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const profileFolder = useActiveProfileFolder();
  const gameRunning = useGameRunning();
  const fix = useFixMods();
  const restoreOriginal = useRestoreOriginalFiles();
  const kind = healthBadgeKind(health);
  if (!health || !kind) return null;
  const action = healthAction(kind);

  return (
    <Alert
      className={className}
      variant={kind === "needsUpdate" ? "warning" : "default"}
      data-testid='mod-health-alert'>
      {kind === "fixable" || kind === "partlyFixable" ? (
        <Wrench className='h-4 w-4 shrink-0 text-primary' />
      ) : kind === "fixed" || kind === "partlyFixed" ? (
        <Check className='h-4 w-4 shrink-0 text-muted-foreground' />
      ) : kind === "originalFiles" ? (
        <FileArchive className='h-4 w-4 shrink-0 text-muted-foreground' />
      ) : (
        <Clock className='h-4 w-4 shrink-0' />
      )}
      <AlertDescription className='flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <ModHealthSummary health={health} kind={kind} isOutdated={isOutdated} />
        {action === "fix" ? (
          <Button
            className='shrink-0'
            size='sm'
            disabled={gameRunning}
            isLoading={fix.isPending}
            icon={<Wrench className='h-4 w-4' />}
            onClick={() =>
              fix.mutate({ profileFolder, modIds: [mod.remoteId] })
            }>
            {t("modHealth.fixForPatch")}
          </Button>
        ) : action === "useOriginalFiles" ? (
          <Button
            className='shrink-0'
            size='sm'
            variant='outline'
            disabled={gameRunning}
            isLoading={restoreOriginal.isPending}
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
        ) : null}
      </AlertDescription>
    </Alert>
  );
};
