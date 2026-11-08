import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { ProhibitIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import type { WithholdNoticeDto } from "@/types/generated/WithholdNoticeDto";

const LABEL = "text-muted-foreground text-xs uppercase";

/** Takes the place of the download footer while GameBanana staff withhold the mod. */
export const WithheldNotice = ({
  notice,
  remoteUrl,
}: {
  notice: WithholdNoticeDto;
  remoteUrl: string;
}) => {
  const { t } = useTranslation();
  const [showReason, setShowReason] = useState(false);
  const hasReason = notice.rules.length > 0 || notice.notes !== "";

  return (
    <div className='z-20 border-amber-500/15 border-t bg-amber-500/[0.04] px-6 py-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex min-w-0 items-center gap-3 text-sm'>
          <ProhibitIcon className='size-4 shrink-0 text-amber-400/80' />
          <span className='font-medium text-foreground'>
            {t("modDetail.withheld.title")}
          </span>
          <span className='truncate text-muted-foreground'>
            {t("modDetail.withheld.description")}
          </span>
        </div>
        <div className='flex shrink-0 items-center gap-5'>
          {hasReason && (
            <Button
              aria-expanded={showReason}
              className='px-0 text-muted-foreground'
              onClick={() => setShowReason((open) => !open)}
              variant='link'>
              {showReason
                ? t("modDetail.withheld.hideReason")
                : t("modDetail.withheld.showReason")}
            </Button>
          )}
          <Button
            className='px-0'
            onClick={async () => {
              try {
                await openUrl(remoteUrl);
              } catch (_error) {
                toast.error(t("notifications.failedToOpenForumPost"));
              }
            }}
            variant='link'>
            {t("modDetail.viewOriginalPost")}
            <ExternalLink />
          </Button>
        </div>
      </div>
      {showReason && (
        <div className='mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-10 gap-y-1 border-foreground/5 border-t pt-3.5 pb-1.5 text-sm'>
          <div className={LABEL}>{t("modDetail.withheld.rule")}</div>
          <div className={LABEL}>{t("modDetail.withheld.staffNote")}</div>
          <div className={`${LABEL} text-right`}>
            {t("modDetail.withheld.withheldAt")}
          </div>
          <div className='space-y-0.5 whitespace-nowrap text-foreground'>
            {notice.rules.map((rule) => (
              <p key={rule.code}>
                <span className='mr-2 font-mono text-amber-300/90 text-xs'>
                  {rule.code}
                </span>
                {rule.name}
              </p>
            ))}
          </div>
          <GameBananaMarkup
            className='max-w-[80ch] text-foreground/80 leading-relaxed'
            content={notice.notes}
          />
          <div className='whitespace-nowrap text-right text-foreground'>
            {notice.withheldAt !== null &&
              format(new Date(notice.withheldAt * 1000), "MMM d, yyyy")}
            {notice.withheldBy && (
              <p className='mt-0.5 text-muted-foreground text-xs'>
                {t("modDetail.withheld.withheldBy", {
                  name: notice.withheldBy,
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
