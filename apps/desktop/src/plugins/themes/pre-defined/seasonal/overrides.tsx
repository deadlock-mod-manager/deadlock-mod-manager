import { useSidebar } from "@deadlock-mods/ui/components/sidebar";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import Logo from "@/components/layout/logo";
import {
  SEASONAL_THEME_IDS,
  type SeasonalThemeId,
} from "@/lib/seasonal-themes";
import type { ThemeOverrides } from "@/types/theme-overrides";
import { useFinds } from "./progress";
import { SEASONS } from "./seasons";

const HideoutProgress = ({ themeId }: { themeId: SeasonalThemeId }) => {
  const { t } = useTranslation();
  const found = useFinds(themeId).length;
  const total = SEASONS[themeId].hideouts.length;
  const summary =
    found >= total
      ? t("plugins.seasonal.hideouts.complete")
      : t("plugins.seasonal.hideouts.progress", { found, total });
  return (
    <div
      className='seasonal-hideout-progress'
      data-complete={found >= total}
      title={summary}
      aria-label={summary}>
      <span>{t("plugins.seasonal.hideouts.label")}</span>
      <span className='tabular-nums'>
        {found}/{total}
      </span>
    </div>
  );
};

const overridesFor = (themeId: SeasonalThemeId): ThemeOverrides => {
  const { Sidebar, logo } = SEASONS[themeId];

  const SidebarCard = () => (
    <div className='group-data-[collapsible=icon]:hidden px-3 pb-3'>
      <div className='seasonal-sidebar-card'>
        <Sidebar />
        <HideoutProgress themeId={themeId} />
      </div>
    </div>
  );

  const FestiveLogo = () => {
    const { state } = useSidebar();
    return (
      <span
        className='seasonal-logo'
        data-collapsed={state === "collapsed"}
        style={logo.colors as CSSProperties}>
        <Logo className='size-full' />
        {logo.Accessory ? (
          <logo.Accessory className='seasonal-logo-accessory' />
        ) : null}
      </span>
    );
  };

  return { sidebarContentExtra: SidebarCard, topbarLogo: FestiveLogo };
};

export const seasonalOverrides = SEASONAL_THEME_IDS.map(
  (themeId) => [themeId, overridesFor(themeId)] as const,
);
