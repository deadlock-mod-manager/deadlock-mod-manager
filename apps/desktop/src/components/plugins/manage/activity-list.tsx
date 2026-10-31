import { useTranslation } from "react-i18next";
import {
  ACTIVITY_ICON,
  describeActivity,
} from "@/components/plugins/access/activity-copy";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { useRelativeTime } from "@/components/plugins/plugin-format";
import type { ExternalPluginActivity } from "@/types/generated/ExternalPluginActivity";

/** Activity entries in the detail panel's event style: icon, line, relative time. */
export const ActivityEvents = ({
  entries,
}: {
  entries: ExternalPluginActivity[];
}) => {
  const { t } = useTranslation();
  const lookup = usePluginProfiles();
  const relativeTime = useRelativeTime();
  return entries.map((entry) => {
    const { icon: EventIcon, color } = ACTIVITY_ICON[entry.kind];
    return (
      <div
        className='flex w-full items-center gap-[10px] py-[6px]'
        key={`${entry.at}-${entry.kind}`}>
        <EventIcon className='shrink-0' color={color} size={14} />
        <span className='min-w-0 truncate text-[12px] text-foreground leading-[normal]'>
          {describeActivity(t, entry, lookup, "event")}
        </span>
        <span className='h-px flex-1' />
        <span className='shrink-0 text-[#A3A3A3] text-[11px] leading-[normal]'>
          {relativeTime(entry.at)}
        </span>
      </div>
    );
  });
};
