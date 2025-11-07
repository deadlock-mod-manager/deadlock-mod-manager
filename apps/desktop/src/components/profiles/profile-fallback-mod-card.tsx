import { Badge } from "@deadlock-mods/ui/components/badge";
import { useTranslation } from "react-i18next";

export const ProfileFallbackModCard = ({
  mod,
}: {
  mod: { remoteId: string };
}) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3'>
      <div className='flex items-center gap-3'>
        <div className='h-10 w-10 rounded bg-destructive/20' />
        <div>
          <p className='font-medium text-sm text-destructive'>
            {t("profiles.modNotFound")}
          </p>
          <p className='text-muted-foreground text-xs'>ID: {mod.remoteId}</p>
        </div>
      </div>

      <Badge variant='destructive' className='h-5 rounded-full text-xs'>
        {t("common.error")}
      </Badge>
    </div>
  );
};
