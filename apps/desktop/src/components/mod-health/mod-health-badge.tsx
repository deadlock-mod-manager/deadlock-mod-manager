import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Check, Clock, FileArchive, Wrench } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import {
  healthBadgeKind,
  type ModHealthBadgeKind,
} from "@/lib/mods/mod-health";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthSymptom } from "@/types/generated/ModHealthSymptom";

const BADGE_STYLES = {
  fixable: "border-primary/50 text-primary",
  partlyFixable: "border-primary/50 text-primary",
  fixed: "border-border text-muted-foreground",
  partlyFixed: "border-border text-muted-foreground",
  originalFiles: "border-border text-muted-foreground",
  needsUpdate: "border-amber-400/50 text-amber-300",
} satisfies Record<ModHealthBadgeKind, string>;

export const BADGE_ICONS = {
  fixable: Wrench,
  partlyFixable: Wrench,
  fixed: Check,
  partlyFixed: Check,
  originalFiles: FileArchive,
  needsUpdate: Clock,
} satisfies Record<ModHealthBadgeKind, typeof Wrench>;

const useSymptomPhrase = () => {
  const { t, i18n } = useTranslation();
  const list = new Intl.ListFormat(i18n.language, {
    style: "short",
    type: "unit",
  });
  return (symptoms: readonly ModHealthSymptom[]) =>
    list.format(
      symptoms.map((symptom) => t(`modHealth.symptomsInline.${symptom}`)),
    );
};

const ModHealthSummary = ({
  health,
  kind,
  isOutdated,
}: {
  health: ModHealth;
  kind: ModHealthBadgeKind;
  isOutdated: boolean;
}) => {
  const { t } = useTranslation();
  const symptomPhrase = useSymptomPhrase();
  const isPartial = kind === "partlyFixable" || kind === "partlyFixed";
  const listed = kind === "needsUpdate" ? health.symptoms : health.fixSymptoms;
  const showsRemaining =
    kind === "originalFiles" && health.remainingSymptoms.length > 0;

  return (
    <div className='space-y-1.5'>
      <p className='text-pretty'>
        {isPartial
          ? t(`modHealth.summary.${kind}`, {
              fixSymptoms: symptomPhrase(health.fixSymptoms),
              remainingSymptoms: symptomPhrase(health.remainingSymptoms),
            })
          : t(`modHealth.summary.${kind}`)}
      </p>
      {!isPartial && listed.length > 0 ? (
        <ul className='list-disc space-y-0.5 pl-4'>
          {listed.map((symptom) => (
            <li key={symptom}>{t(`modHealth.symptoms.${symptom}`)}</li>
          ))}
        </ul>
      ) : null}
      {showsRemaining ? (
        <p className='text-pretty'>
          {t("modHealth.stillNeedsUpdate", {
            remainingSymptoms: symptomPhrase(health.remainingSymptoms),
          })}
        </p>
      ) : null}
      {isOutdated ? (
        <p className='opacity-80'>{t("modHealth.lastUpdatedBefore")}</p>
      ) : null}
    </div>
  );
};

export const ModHealthBadge = ({
  health,
  isOutdated,
  className,
}: {
  health: ModHealth | undefined;
  isOutdated: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const kind = healthBadgeKind(health, isOutdated);
  if (!health || !kind) return null;
  const Icon = BADGE_ICONS[kind];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={cn(
            "cursor-help bg-background/95",
            BADGE_STYLES[kind],
            className,
          )}
          data-testid='mod-health-badge'
          data-status={kind}
          variant='outline'>
          <Icon aria-hidden />
          {t(`modHealth.badge.${kind}`)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs'>
        <ModHealthSummary health={health} kind={kind} isOutdated={isOutdated} />
      </TooltipContent>
    </Tooltip>
  );
};

export const SymptomBadge = ({
  symptom,
  className,
}: {
  symptom: ModHealthSymptom;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant='outline'
          className={cn("cursor-help font-normal text-xs", className)}>
          {t(`modHealth.symptoms.${symptom}`)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className='max-w-64'>
        {t(`modHealth.symptomHints.${symptom}`)}
      </TooltipContent>
    </Tooltip>
  );
};
