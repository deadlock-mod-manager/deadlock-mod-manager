import { Button } from "@deadlock-mods/ui/components/button";
import { XCircle } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";

/** Sits above the download footer: obsolete mods stay installable. */
export const ObsoleteNotice = ({ note }: { note?: string | null }) => {
  const { t } = useTranslation();
  const [showNote, setShowNote] = useState(false);

  return (
    <div className='z-20 border-border/40 border-t bg-foreground/[0.02] px-6 py-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex min-w-0 items-center gap-3 text-sm'>
          <XCircle className='size-4 shrink-0 text-muted-foreground' />
          <span className='font-medium text-foreground'>
            {t("warnings.obsoleteLabel")}
          </span>
          <span className='truncate text-muted-foreground'>
            {t("warnings.obsoleteDescription")}
          </span>
        </div>
        {note && (
          <Button
            aria-expanded={showNote}
            className='shrink-0 px-0 text-muted-foreground'
            onClick={() => setShowNote((open) => !open)}
            variant='link'>
            {showNote
              ? t("modDetail.obsolete.hideNote")
              : t("modDetail.obsolete.showNote")}
          </Button>
        )}
      </div>
      {note && showNote && (
        <GameBananaMarkup
          className='mt-3 max-w-[80ch] border-foreground/5 border-t pt-3.5 pb-1.5 text-foreground/80 text-sm leading-relaxed'
          content={note}
        />
      )}
    </div>
  );
};
