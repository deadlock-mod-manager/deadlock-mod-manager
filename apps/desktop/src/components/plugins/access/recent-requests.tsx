import { CheckCircleIcon, ProhibitIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  describeActivity,
  REQUEST_KINDS,
} from "@/components/plugins/access/activity-copy";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { useRelativeTime } from "@/components/plugins/plugin-format";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { useExternalPluginActivity } from "@/hooks/use-external-plugin-activity";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const RECENT_REQUESTS = 3;

export const RecentRequests = ({
  plugin,
  onSeeAll,
}: {
  plugin: ExternalPluginSummary;
  onSeeAll: () => void;
}) => {
  const { t } = useTranslation();
  const lookup = usePluginProfiles();
  const relativeTime = useRelativeTime();
  const { data: activity = [] } = useExternalPluginActivity(plugin.id);
  const requests = activity
    .filter((entry) => REQUEST_KINDS.includes(entry.kind))
    .slice(0, RECENT_REQUESTS);

  return (
    <div className='flex w-full flex-col gap-[2px]'>
      <div className='flex w-full items-center pb-[6px]'>
        <span className='font-semibold text-[#A3A3A3] text-[11px] uppercase leading-[normal]'>
          {t("plugins.access.sheet.recentRequests")}
        </span>
        <span className='h-px flex-1' />
        <button
          className='text-[12px] text-primary leading-[normal] hover:underline'
          onClick={onSeeAll}
          type='button'>
          {t("plugins.access.sheet.seeAll")}
        </button>
      </div>
      {requests.length === 0 && (
        <p className='px-[10px] py-[8px] text-[#A3A3A3] text-[12px] leading-[normal]'>
          {t("plugins.access.sheet.noRequests")}
        </p>
      )}
      {requests.map((request) => {
        const blocked = request.kind === "blocked";
        const StateIcon = blocked ? ProhibitIcon : CheckCircleIcon;
        return (
          <div
            className={cn(
              "flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px]",
              blocked &&
                "bg-[#F8717112] outline outline-1 -outline-offset-1 outline-[#F8717133]",
            )}
            key={`${request.at}-${request.kind}`}>
            <StateIcon
              className='shrink-0'
              color={blocked ? TONE_COLOR.danger : TONE_COLOR.ok}
              size={15}
            />
            <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
              <span className='truncate text-[13px] text-foreground leading-[normal]'>
                {describeActivity(t, request, lookup, "request")}
              </span>
              <span className='truncate font-mono text-[#A3A3A3] text-[11px] leading-[normal]'>
                {request.method ?? request.permission}
              </span>
            </div>
            <span className='shrink-0 text-[#A3A3A3] text-[11px] leading-[normal]'>
              {relativeTime(request.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
