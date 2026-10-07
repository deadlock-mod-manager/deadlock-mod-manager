import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { ExternalLink, X, Zap } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

const PATRON_URL = "https://deadlock-api.com/patron";

/**
 * The one thing that makes the data on this page better and cannot be switched
 * on from here: patrons register their Steam account with deadlock-api, which
 * puts it in a dedicated fetch queue. No key, no setting - so this is a footnote
 * rather than a call to action, and it goes away for good once dismissed. It
 * takes the same shape as the match sharing hint, since only one shows at a time.
 */
export const PatronHint = ({ onDismiss }: { onDismiss: () => void }) => {
  const { t } = useTranslation();

  return (
    <Alert className='flex items-center gap-3 py-2.5'>
      <Zap className='h-4 w-4 shrink-0 text-muted-foreground' />
      <AlertDescription className='min-w-0 flex-1 text-muted-foreground'>
        {t("stats.credit.priorityHint")}
      </AlertDescription>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          className='h-7 gap-1.5 px-2 text-xs'
          onClick={() => void openUrl(PATRON_URL)}
          size='sm'
          variant='ghost'>
          {t("stats.credit.priorityCta")}
          <ExternalLink className='h-3 w-3' />
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
