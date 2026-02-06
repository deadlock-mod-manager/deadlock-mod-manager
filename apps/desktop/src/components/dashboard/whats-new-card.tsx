import { Sparkle } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { GITHUB_REPO } from "@/lib/constants";
import { DashboardCard } from "./dashboard-card";

export const WhatsNewCard = () => {
  const { t } = useTranslation();

  const getFeatures = (version: string): string[] => {
    const features = t(`whatsNew.versions.${version}.features`, {
      returnObjects: true,
      defaultValue: [],
    });
    if (!Array.isArray(features)) return [];
    return features.filter((f): f is string => typeof f === "string");
  };

  const recentUpdates = [
    {
      version: "0.13.1",
      title: t("whatsNew.versions.0.13.1.title"),
      features: getFeatures("0.13.1"),
    },
    {
      version: "0.12.0",
      title: t("whatsNew.versions.0.12.0.title"),
      features: getFeatures("0.12.0"),
    },
    {
      version: "0.11.1",
      title: t("whatsNew.versions.0.11.1.title"),
      features: getFeatures("0.11.1"),
    },
  ];

  return (
    <DashboardCard
      contentClassName='space-y-4'
      icon={<Sparkle className='h-5 w-5 text-primary' weight='duotone' />}
      title={t("navigation.whatsNew")}>
      {recentUpdates.map((update) => (
        <div key={update.version} className='space-y-2'>
          <div className='flex items-center gap-2'>
            <span className='rounded-md bg-primary/10 px-2 py-1 font-mono text-primary text-xs'>
              v{update.version}
            </span>
            <span className='font-medium text-sm'>{update.title}</span>
          </div>
          <ul className='space-y-1 pl-4 overflow-y-scroll max-h-24 scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin custom-scrollbar'>
            {update.features.map((feature) => (
              <li key={feature} className='text-muted-foreground text-sm'>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button
        className='text-primary hover:underline text-sm'
        onClick={() => open(`${GITHUB_REPO}/releases`)}
        type='button'>
        {t("whatsNew.fullReleaseNotes")}
      </button>
    </DashboardCard>
  );
};
