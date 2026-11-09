import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface SkinConflictNoticeProps {
  hero: string;
  count: number;
}

/** Several skins installed while the user expects one; only one can show. */
export const SkinConflictNotice = ({
  hero,
  count,
}: SkinConflictNoticeProps) => {
  const { t } = useTranslation();

  return (
    <div
      className='flex items-start gap-2.5 rounded-lg border border-signal-poor/35 bg-signal-poor/[0.08] px-3.5 py-3'
      role='status'>
      <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0 text-signal-poor' />
      <div className='min-w-0'>
        <p className='font-medium text-sm'>
          {t("skins.conflictTitle", { hero, count })}
        </p>
        <p className='mt-0.5 text-muted-foreground text-xs'>
          {t("skins.conflictHint")}
        </p>
      </div>
    </div>
  );
};
