import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Clock, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

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
 * of happening quietly.
 */
export const MatchSyncHint = ({
  missingCount,
  onDismiss,
}: MatchSyncHintProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Alert className='flex flex-wrap items-center gap-3'>
      <Clock className='h-4 w-4 shrink-0' />
      <AlertDescription className='min-w-[16rem] flex-1'>
        {missingCount > 0
          ? t("stats.matchSyncHint.missing", { count: missingCount })
          : t("stats.matchSyncHint.description")}
      </AlertDescription>
      <div className='flex shrink-0 items-center gap-2'>
        <Button
          onClick={() =>
            // Match sync lives in the privacy tab, next to the consent it needs.
            navigate("/settings", { state: { activeTab: "privacy" } })
          }
          size='sm'
          variant='outline'>
          {t("stats.matchSyncHint.enable")}
        </Button>
        <Button
          aria-label={t("common.dismiss")}
          className='h-7 w-7'
          onClick={onDismiss}
          size='icon'
          variant='ghost'>
          <X className='h-4 w-4' />
        </Button>
      </div>
    </Alert>
  );
};
