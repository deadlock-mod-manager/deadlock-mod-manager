import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Clock, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface MatchSyncHintProps {
  /**
   * How many matches the game logged that the API has not ingested yet. Zero
   * means nothing concrete is missing yet, so the hint stays general.
   */
  missingCount: number;
  onDismiss: () => void;
}

/**
 * Shown while match sharing is off. deadlock-api ingests with up to a day of
 * delay and only sees matches somebody uploaded; the app can close both gaps
 * from Valve's Game Coordinator, but that uses the local Steam session, which
 * lives behind the match-sync consent - so it has to be asked for once instead
 * of happening quietly. It only explains; the header switch right above is the
 * control, so a second "turn on" button would just compete with it.
 */
export const MatchSyncHint = ({
  missingCount,
  onDismiss,
}: MatchSyncHintProps) => {
  const { t } = useTranslation();

  return (
    <Alert className='flex items-center gap-3 py-2.5'>
      <Clock className='h-4 w-4 shrink-0' />
      <AlertDescription className='min-w-0 flex-1'>
        {missingCount > 0
          ? t("stats.matchSyncHint.missing", { count: missingCount })
          : t("stats.matchSyncHint.description")}
      </AlertDescription>
      <Button
        aria-label={t("common.dismiss")}
        className='h-7 w-7 shrink-0'
        onClick={onDismiss}
        size='icon'
        variant='ghost'>
        <X className='h-4 w-4' />
      </Button>
    </Alert>
  );
};
