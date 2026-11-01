import { ArrowCircleUpIcon, EyeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { updateChanges } from "@/components/plugins/page/update-changes";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginPendingUpdate } from "@/types/generated/ExternalPluginPendingUpdate";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";

export const UpdateBanner = ({
  plugin,
  update,
  onReview,
}: {
  plugin: ExternalPluginSummary;
  update: ExternalPluginPendingUpdate;
  onReview: () => void;
}) => {
  const { t } = useTranslation();
  const { added } = updateChanges(plugin, update);
  return (
    <div className='flex shrink-0 items-center gap-3 border-[#6FA8F533] border-b bg-[#6FA8F514] px-6 pt-2.5 pb-[9px]'>
      <ArrowCircleUpIcon color={TONE_COLOR.info} size={16} />
      <p className='flex-1 text-[13px] text-foreground leading-[normal]'>
        {added.length > 0
          ? t("plugins.page.update.banner", {
              count: added.length,
              version: update.version,
            })
          : t("plugins.page.update.bannerNothingNew", {
              version: update.version,
            })}
      </p>
      <PageButton onClick={onReview} variant='outline'>
        <EyeIcon />
        {t("plugins.page.update.review")}
      </PageButton>
    </div>
  );
};
