import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { ApplicationSection } from "./application-section";
import { AutoexecSection } from "./autoexec-section";
import { BackupsSection } from "./backups-section";
import { DiscordSection } from "./discord-section";
import { GameSection } from "./game-section";
import { LaunchOptionsSection } from "./launch-options-section";
import { LoggingSection } from "./logging-section";
import { NetworkSection } from "./network-section";
import { PrivacySection } from "./privacy-section";
import { NAV, sectionLabels } from "./settings-navigation";
import { type SettingsSectionId, usePreviewNavigation } from "./store";
import { ThemesSection } from "./themes-section";
import { ToolsSection } from "./tools-section";

const SECTIONS = {
  "launch-options": () => <LaunchOptionsSection />,
  autoexec: () => <AutoexecSection />,
  game: () => <GameSection />,
  application: () => <ApplicationSection />,
  themes: () => <ThemesSection />,
  network: () => <NetworkSection />,
  discord: () => <DiscordSection />,
  tools: () => <ToolsSection />,
  backups: () => <BackupsSection />,
  logging: () => <LoggingSection />,
  privacy: () => <PrivacySection />,
} satisfies Record<SettingsSectionId, () => React.ReactNode>;

export const SettingsScreen = () => {
  const { t } = useTranslation("preview");
  const { settingsSection, setSettingsSection } = usePreviewNavigation();
  const labels = sectionLabels(t);

  return (
    <div className='flex flex-col gap-4 pb-6'>
      <div className='px-4 pt-4'>
        <h3 className='font-bold text-2xl'>{t("settings.title")}</h3>
      </div>
      <div className='flex gap-6'>
        <nav
          aria-label={t("settings.navLabel")}
          className='sticky top-0 w-52 shrink-0 self-start p-2'>
          {NAV.map((group) => (
            <div key={group.id} className='flex flex-col gap-0.5'>
              <p className='px-3 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-wider'>
                {t(`settings.groups.${group.id}`)}
              </p>
              {group.items.map((item) => {
                const isActive = item.id === settingsSection;
                return (
                  <button
                    key={item.id}
                    type='button'
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setSettingsSection(item.id)}
                    className={cn(
                      "relative flex h-10 w-full items-center gap-3 rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-foreground before:-translate-y-1/2 before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[2px] before:rounded-r-full before:bg-primary"
                        : "hover:bg-muted/50 hover:text-foreground",
                    )}>
                    <item.icon className='size-4 shrink-0' />
                    {labels[item.id]}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div
          key={settingsSection}
          className='min-w-0 flex-1 animate-dl-rise space-y-4 pr-4'>
          {SECTIONS[settingsSection]()}
        </div>
      </div>
    </div>
  );
};
