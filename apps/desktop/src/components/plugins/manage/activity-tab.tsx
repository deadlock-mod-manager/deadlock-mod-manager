import { useTranslation } from "react-i18next";
import { ActivityEvents } from "@/components/plugins/manage/activity-list";
import { useExternalPluginActivity } from "@/hooks/use-external-plugin-activity";
import { getErrorMessage } from "@/lib/errors";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const ActivityTab = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const activityQuery = useExternalPluginActivity(plugin.id);
  if (activityQuery.isError) {
    return (
      <p className='text-[#F87171] text-[12px] leading-[normal]' role='alert'>
        {t("plugins.activity.loadFailed", {
          message: getErrorMessage(activityQuery.error),
        })}
      </p>
    );
  }
  const entries = activityQuery.data ?? [];
  if (entries.length === 0) {
    return (
      <p className='text-muted-foreground text-[12px] leading-[17px]'>
        {activityQuery.isPending
          ? t("common.loading")
          : t("plugins.activity.empty")}
      </p>
    );
  }
  return (
    <div className='flex w-full flex-col gap-[2px] px-[2px]'>
      <ActivityEvents entries={entries} />
    </div>
  );
};
