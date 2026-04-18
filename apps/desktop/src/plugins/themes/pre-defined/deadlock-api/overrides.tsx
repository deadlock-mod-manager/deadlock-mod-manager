import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ThemeOverrides } from "@/types/theme-overrides";
import { getPluginAssetUrl } from "@/lib/plugins";
import { AnimatedHexeIcon } from "./animated-hexe-icon";
import { ElectricBorder } from "./electric-border";

const deadlockApiSidebarIconUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/deadlock-api/sidebar.svg",
);

const CardWrapper = ({ children }: { children: ReactNode }) => (
  <ElectricBorder borderRadius={12} chaos={0.03} speed={0.5} className='h-full'>
    {children}
  </ElectricBorder>
);

const DashboardCardWrapper = ({ children }: { children: ReactNode }) => (
  <ElectricBorder borderRadius={12} chaos={0.06} speed={0.8} className='h-full'>
    {children}
  </ElectricBorder>
);

const TopbarLogo = () => <AnimatedHexeIcon size={44} />;

const SidebarFooterExtra = () => {
  const { t } = useTranslation();

  return (
    <div className='group-data-[collapsible=icon]:hidden flex justify-center px-3 py-4'>
      <img
        alt={t("accessibility.deadlockApiIconAlt")}
        className='max-w-[56px] w-full object-contain dl-electric-icon'
        src={deadlockApiSidebarIconUrl}
      />
    </div>
  );
};

const SettingsIngestExtra = () => {
  const { t } = useTranslation();

  return (
    <img
      alt={t("accessibility.deadlockApiIconAlt")}
      className='w-10 h-10 object-contain dl-electric-icon'
      src={deadlockApiSidebarIconUrl}
    />
  );
};

export const overrides: ThemeOverrides = {
  cardWrapper: CardWrapper,
  dashboardCardWrapper: DashboardCardWrapper,
  topbarLogo: TopbarLogo,
  sidebarFooterExtra: SidebarFooterExtra,
  settingsIngestExtra: SettingsIngestExtra,
};
