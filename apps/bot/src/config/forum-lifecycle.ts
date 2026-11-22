import { env } from "@/lib/env";
import type { ForumLifecycleConfig } from "@/lib/forum-status";

// Only forums listed here are managed. Commission and mod request channels
// are intentionally absent and must stay that way.
export const managedForums: ForumLifecycleConfig[] = [
  {
    channelId: env.BUG_REPORT_CHANNEL_ID,
    statusTags: {
      open: "1561726289843331203",
      inProgress: "1451918130589728830",
      resolved: "1435597626597834782",
      duplicate: "1561726387545440326",
      wontFix: "1464976113724952586",
    },
    closedStatuses: ["resolved", "duplicate", "wontFix"],
    idleCloseStatus: "resolved",
    solveButton: true,
  },
  {
    channelId: env.SUGGESTIONS_CHANNEL_ID,
    statusTags: {
      open: "1561726853108994109",
      planned: "1561726900647231558",
      declined: "1561726940237398106",
      duplicate: "1561726965285785650",
    },
    closedStatuses: ["planned", "declined", "duplicate"],
    idleCloseStatus: "open",
    solveButton: false,
  },
];

export function getForumConfig(
  parentId: string | null,
): ForumLifecycleConfig | undefined {
  return managedForums.find((forum) => forum.channelId === parentId);
}
