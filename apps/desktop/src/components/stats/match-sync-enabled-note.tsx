import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { CircleCheck } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const MatchSyncEnabledNote = () => {
  const { t } = useTranslation();

  return (
    <Alert
      className='border-primary/30 bg-primary/5 py-2.5 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none'
      role='status'>
      <CircleCheck className='h-4 w-4 shrink-0 text-primary' />
      <AlertDescription>{t("stats.matchSyncHint.enabled")}</AlertDescription>
    </Alert>
  );
};
