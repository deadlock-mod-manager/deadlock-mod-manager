import { useTranslation } from "react-i18next";
import { AlwaysBlocked } from "@/components/plugins/access/always-blocked";
import { PermissionGrantCards } from "@/components/plugins/access/grant-cards";
import { ActivityEvents } from "@/components/plugins/manage/activity-list";
import { SectionLabel } from "@/components/plugins/manage/section-label";
import { useExternalPluginActivity } from "@/hooks/use-external-plugin-activity";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const RECENT_EVENTS = 2;

export const AccessTab = ({
  plugin,
  onSeeAll,
}: {
  plugin: ExternalPluginSummary;
  onSeeAll: () => void;
}) => {
  const { t } = useTranslation();
  const { data: activity = [] } = useExternalPluginActivity(plugin.id);
  return (
    <>
      <p className='w-full text-muted-foreground text-[12px] leading-[17px]'>
        {t("plugins.manage.panel.intro")}
      </p>
      <PermissionGrantCards plugin={plugin} />
      <AlwaysBlocked plugin={plugin} />
      {activity.length > 0 && (
        <div className='flex w-full flex-col gap-[2px] px-[2px] pt-[6px]'>
          <div className='flex w-full items-center pb-[4px]'>
            <SectionLabel>
              {t("plugins.manage.panel.recentActivity")}
            </SectionLabel>
            <span className='h-px flex-1' />
            <button
              className='text-[12px] text-primary leading-[normal] hover:underline'
              onClick={onSeeAll}
              type='button'>
              {t("plugins.manage.panel.seeAll")}
            </button>
          </div>
          <ActivityEvents entries={activity.slice(0, RECENT_EVENTS)} />
        </div>
      )}
    </>
  );
};
