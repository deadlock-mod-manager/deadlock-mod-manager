import { ArrowCircleUpIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { StateArea } from "@/components/plugins/page/state-area";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";

export const WaitsForUpdateState = ({
  plugin,
  version,
  onReview,
}: {
  plugin: ExternalPluginSummary;
  version: string;
  onReview: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <StateArea
      body={t("plugins.page.update.waits.body", { version })}
      color={TONE_COLOR.info}
      icon={ArrowCircleUpIcon}
      title={t("plugins.page.update.waits.title", { name: plugin.name })}>
      <PageButton onClick={onReview} variant='primary'>
        <ArrowCircleUpIcon />
        {t("plugins.page.update.review")}
      </PageButton>
    </StateArea>
  );
};
