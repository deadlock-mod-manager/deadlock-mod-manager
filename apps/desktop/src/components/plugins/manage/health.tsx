import { useTranslation } from "react-i18next";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { Stat } from "@/components/plugins/manage/stat";
import {
  formatPluginSize,
  useRelativeTime,
} from "@/components/plugins/plugin-format";
import { pageState, TONE_COLOR } from "@/components/plugins/plugin-status";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const Health = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();
  const state = pageState(
    plugin,
    "plugins.state.needsSetup",
    "plugins.state.stoppedAfterErrors",
  );
  const color = TONE_COLOR[state.tone];
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-[10px] bg-background px-[14px] py-[10px] outline-foreground/[0.04]",
        INSET_OUTLINE,
      )}>
      <Stat label={t("plugins.manage.panel.worker")}>
        <span
          className='size-[7px] rounded-full'
          style={{ backgroundColor: color }}
        />
        <span style={{ color }}>{t(state.labelKey)}</span>
      </Stat>
      <Stat label={t("plugins.manage.panel.lastCheck")}>
        {plugin.lastTickAt
          ? relativeTime(plugin.lastTickAt)
          : t("plugins.manage.panel.never")}
      </Stat>
      <Stat label={t("plugins.manage.panel.restarts")}>
        {t("plugins.manage.panel.restartsToday", {
          count: plugin.restartsToday,
        })}
      </Stat>
      <Stat label={t("plugins.manage.panel.storage")}>
        {formatPluginSize(plugin.storageBytes)}
      </Stat>
    </div>
  );
};
