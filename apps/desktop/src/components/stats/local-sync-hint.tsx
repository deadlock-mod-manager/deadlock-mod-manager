import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Clock, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

interface LocalSyncHintProps {
  /** How many matches the game logged that the API has not ingested yet. */
  missingCount: number;
  onDismiss: () => void;
}

/**
 * deadlock-api ingests with up to a day of delay. The app can close that gap
 * from Valve's Game Coordinator, but that uses the local Steam session, which
 * lives behind the match-sync consent - so it has to be asked for once instead
 * of happening quietly.
 */
export const LocalSyncHint = ({
  missingCount,
  onDismiss,
}: LocalSyncHintProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Alert className='flex items-center gap-3'>
      <Clock className='h-4 w-4 shrink-0' />
      <AlertDescription className='min-w-0 flex-1'>
        {t("stats.localSync.description", { count: missingCount })}
      </AlertDescription>
      <Button
        className='shrink-0'
        onClick={() =>
          // Match sync lives in the privacy tab, next to the consent it needs.
          navigate("/settings", { state: { activeTab: "privacy" } })
        }
        size='sm'
        variant='outline'>
        {t("stats.localSync.enable")}
      </Button>
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
