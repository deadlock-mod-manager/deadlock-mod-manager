import { ExternalLink } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

export const DEADLOCK_API_URL = "https://deadlock-api.com/";
export const PATRON_URL = "https://deadlock-api.com/patron";
const LOGO_URL = "/brand/deadlock-api.svg";

/**
 * Attribution for the service every number on this page comes from. Deliberately
 * quiet - it sits in the header's meta column next to the refresh timestamp,
 * where a bordered chip would read as another control.
 */
export const DeadlockApiCredit = () => {
  const { t } = useTranslation();

  return (
    <button
      className='group flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground'
      onClick={() => void openUrl(DEADLOCK_API_URL)}
      type='button'>
      <img alt='' className='h-4 w-4 shrink-0 object-contain' src={LOGO_URL} />
      <span className='font-medium'>{t("stats.credit.name")}</span>
      <ExternalLink className='h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100' />
    </button>
  );
};
