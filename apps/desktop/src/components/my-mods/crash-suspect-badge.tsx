import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { useRecentCrashReport } from "@/lib/launch-health/crash-suspect";
import { usePersistedStore } from "@/lib/store";

export function CrashSuspectBadge({ modId }: { modId: string }) {
  const { t } = useTranslation();
  const report = useRecentCrashReport((state) => state.report);
  const profileId = usePersistedStore((state) => state.activeProfileId);
  if (
    report?.fingerprint.client?.profileId !== profileId ||
    report?.crashSuspect?.modId !== modId
  )
    return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          variant='outline'
          className='border-amber-500/50 bg-background/95 text-amber-600 dark:text-amber-400'>
          {t("launchHealth.dialog.possibleCauseBadge")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{report.crashSuspect.resourcePath}</TooltipContent>
    </Tooltip>
  );
}
