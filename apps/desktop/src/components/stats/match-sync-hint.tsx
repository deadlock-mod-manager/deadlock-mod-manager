import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Clock, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface MatchSyncHintProps {
  missingCount: number;
  onDismiss: () => void;
}

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
