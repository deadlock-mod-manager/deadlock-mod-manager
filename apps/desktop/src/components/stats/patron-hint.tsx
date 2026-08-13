import { ExternalLink, X, Zap } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { PATRON_URL } from "@/components/stats/deadlock-api-credit";

/**
 * The one thing that makes the data on this page better and cannot be switched
 * on from here: patrons register their Steam account with deadlock-api, which
 * puts it in a dedicated fetch queue. No key, no setting - so this is a footnote
 * rather than a call to action, and it goes away for good once dismissed.
 */
export const PatronHint = ({ onDismiss }: { onDismiss: () => void }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-2 text-muted-foreground text-xs'>
      <Zap className='h-3.5 w-3.5 shrink-0 opacity-60' />
      <p className='min-w-0 flex-1'>
        {t("stats.credit.priorityHint")}{" "}
        <button
          className='inline-flex items-center gap-1 underline underline-offset-2 transition-colors hover:text-foreground'
          onClick={() => void openUrl(PATRON_URL)}
          type='button'>
          {t("stats.credit.priorityCta")}
          <ExternalLink className='h-3 w-3' />
        </button>
      </p>
      <button
        aria-label={t("common.dismiss")}
        className='shrink-0 opacity-50 transition-opacity hover:opacity-100'
        onClick={onDismiss}
        type='button'>
        <X className='h-3.5 w-3.5' />
      </button>
    </div>
  );
};
