import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Undo2, Wrench } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import {
  useActiveProfileFolder,
  useFixMods,
  useGameRunning,
  useRestoreOriginalFiles,
} from "@/hooks/use-mod-health";
import {
  healthAction,
  healthBadgeKind,
  type ModHealthBadgeKind,
} from "@/lib/mods/mod-health";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthSymptom } from "@/types/generated/ModHealthSymptom";
import type { LocalMod } from "@/types/mods";
import { BADGE_ICONS } from "./mod-health-badge";

const ICON_TONES = {
  fixable: "text-primary",
  partlyFixable: "text-primary",
  fixed: "text-muted-foreground",
  partlyFixed: "text-muted-foreground",
  originalFiles: "text-muted-foreground",
  needsUpdate: "text-amber-300",
} satisfies Record<ModHealthBadgeKind, string>;

const SymptomGroup = ({
  symptoms,
  needsUpdate,
}: {
  symptoms: readonly ModHealthSymptom[];
  needsUpdate: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <ul className='flex flex-wrap gap-1.5'>
      {symptoms.map((symptom) => (
        <li key={symptom}>
          <Badge
            variant='outline'
            className={cn(
              "font-normal text-xs",
              needsUpdate
                ? "border-amber-400/25 text-amber-200/80"
                : "text-muted-foreground",
            )}>
            {t(`modHealth.symptoms.${symptom}`)}
          </Badge>
        </li>
      ))}
    </ul>
  );
};

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
  const kind = healthBadgeKind(health, isOutdated);
  if (!health || !kind) return null;
  const action = healthAction(kind);
  const Icon = BADGE_ICONS[kind];

  const listed = kind === "needsUpdate" ? health.symptoms : health.fixSymptoms;
  const remaining = kind === "needsUpdate" ? [] : health.remainingSymptoms;
  // The title names the listed parts, unless they need their own label.
  const labelled = kind === "originalFiles" || remaining.length > 0;
  const fixLabel =
    kind === "fixed" || kind === "partlyFixed"
      ? t("modHealth.alert.fixed")
      : t("modHealth.alert.canFix");

  return (
    <Alert
      className={cn("items-start gap-3", className)}
      variant={kind === "needsUpdate" ? "warning" : "default"}
      data-testid='mod-health-alert'
      data-status={kind}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary/60 ring-1 ring-border/80",
          ICON_TONES[kind],
        )}>
        <Icon aria-hidden className='size-4' />
      </div>
      <AlertDescription className='flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6'>
        <div className='flex min-w-0 flex-col gap-2'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
            <p className='font-medium text-foreground leading-8'>
              {t(`modHealth.badge.${kind}`)}
            </p>
            {!labelled && listed.length > 0 ? (
              <SymptomGroup
                symptoms={listed}
                needsUpdate={kind === "needsUpdate"}
              />
            ) : null}
          </div>
          {labelled ? (
            <dl className='grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2'>
              {listed.length > 0 ? (
                <>
                  <dt className='text-muted-foreground text-xs'>{fixLabel}</dt>
                  <dd>
                    <SymptomGroup symptoms={listed} needsUpdate={false} />
                  </dd>
                </>
              ) : null}
              {remaining.length > 0 ? (
                <>
                  <dt className='text-muted-foreground text-xs'>
                    {t("modHealth.alert.needsUpdate")}
                  </dt>
                  <dd>
                    <SymptomGroup symptoms={remaining} needsUpdate />
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <p className='text-pretty text-muted-foreground text-xs leading-5'>
            {t(`modHealth.alert.description.${kind}`)}
            {isOutdated ? ` ${t("modHealth.lastUpdatedBefore")}` : null}
          </p>
        </div>
        {action ? (
          <div className='flex shrink-0 flex-col items-start gap-1.5 sm:items-end'>
            {action === "fix" ? (
              <Button
                size='sm'
                disabled={gameRunning}
                isLoading={fix.isPending}
                icon={<Wrench className='h-4 w-4' />}
                onClick={() =>
                  fix.mutate({ profileFolder, modIds: [mod.remoteId] })
                }>
                {t("modHealth.fixForPatch")}
              </Button>
            ) : (
              <Button
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
            )}
            {gameRunning ? (
              <p className='text-muted-foreground text-xs'>
                {action === "fix"
                  ? t("modHealth.closeGame")
                  : t("modHealth.alert.closeGameToSwitch")}
              </p>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};
