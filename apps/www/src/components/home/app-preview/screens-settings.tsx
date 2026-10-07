import { Badge } from "@deadlock-mods/ui/components/badge";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArchiveIcon,
  ArticleIcon,
  CheckCircleIcon,
  DiscordLogoIcon,
  FolderOpenIcon,
  GameControllerIcon,
  GearIcon,
  GlobeIcon,
  type Icon,
  MonitorIcon,
  PaletteIcon,
  ScrollIcon,
  ShieldIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getLocaleConfig } from "@/lib/i18n/locales";
import { useLocale } from "@/lib/i18n/route";
import { usePreviewState } from "./preview-state";
import { type SettingsSectionId, usePreviewNavigation } from "./store";
import { PREVIEW_THEMES } from "./themes";

// Copy comes from the desktop app's English locale (settings.*).
const NAV: {
  id: "game" | "application" | "advanced";
  items: { id: SettingsSectionId; icon: Icon }[];
}[] = [
  {
    id: "game",
    items: [
      { id: "launch-options", icon: GearIcon },
      { id: "autoexec", icon: ArticleIcon },
      { id: "game", icon: GameControllerIcon },
    ],
  },
  {
    id: "application",
    items: [
      { id: "application", icon: MonitorIcon },
      { id: "themes", icon: PaletteIcon },
      { id: "network", icon: GlobeIcon },
      { id: "discord", icon: DiscordLogoIcon },
    ],
  },
  {
    id: "advanced",
    items: [
      { id: "tools", icon: WrenchIcon },
      { id: "backups", icon: ArchiveIcon },
      { id: "logging", icon: ScrollIcon },
      { id: "privacy", icon: ShieldIcon },
    ],
  },
];

// The file name and Discord stay as they are in every language.
const sectionLabels = (t: TFunction<"preview">) =>
  ({
    "launch-options": t("settings.nav.launchOptions"),
    autoexec: "Autoexec.cfg",
    game: t("settings.nav.game"),
    application: t("settings.nav.application"),
    themes: t("settings.nav.themes"),
    network: t("settings.nav.network"),
    discord: "Discord",
    tools: t("settings.nav.tools"),
    backups: t("settings.nav.backups"),
    logging: t("settings.nav.logging"),
    privacy: t("settings.nav.privacy"),
  }) satisfies Record<SettingsSectionId, string>;

const Section = ({
  title,
  description,
  action,
  flat = false,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Drops the panel chrome when the content is already made of cards. */
  flat?: boolean;
  children: React.ReactNode;
}) => (
  <section
    className={cn(
      "flex flex-col",
      !flat && "rounded-lg border border-border/50 bg-card/50 p-5",
    )}>
    <div className='flex items-start justify-between gap-4 border-border/30 border-b pb-3'>
      <div className='flex min-w-0 flex-col gap-1'>
        <h4 className='font-semibold text-lg leading-tight'>{title}</h4>
        {description && (
          <p className='text-muted-foreground text-sm'>{description}</p>
        )}
      </div>
      {action && <div className='shrink-0'>{action}</div>}
    </div>
    <div className='mt-4 flex flex-col gap-4'>{children}</div>
  </section>
);

const ToggleRow = ({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label className='flex cursor-pointer items-center justify-between gap-6'>
    <span className='space-y-1'>
      <span className='block font-bold text-sm'>{label}</span>
      <span className='block text-muted-foreground text-sm'>{description}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>
);

/** A toggle with local state, for settings that only matter inside the app. */
const LocalToggle = (props: {
  label: string;
  description: string;
  initial: boolean;
}) => {
  const [checked, setChecked] = useState(props.initial);
  return (
    <ToggleRow
      label={props.label}
      description={props.description}
      checked={checked}
      onCheckedChange={setChecked}
    />
  );
};

const ActionRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className='flex items-center gap-4'>
    <div className='min-w-0 flex-1'>
      <p className='font-medium text-foreground/90 text-sm'>{label}</p>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {description}
      </p>
    </div>
    {children}
  </div>
);

const ThemesSection = () => {
  const { t } = useTranslation("preview");
  const { theme, setTheme } = usePreviewNavigation();
  return (
    <Section
      flat
      title={t("settings.themes.title")}
      description={t("settings.themes.description")}>
      <div className='inline-flex w-fit rounded-lg bg-muted p-1 text-sm'>
        <span className='rounded-md bg-background px-3 py-1 font-medium shadow'>
          {t("settings.themes.predefined")}
        </span>
        <span className='px-3 py-1 text-muted-foreground'>
          {t("settings.themes.custom")}
        </span>
      </div>
      <div className='grid grid-cols-2 gap-4'>
        {PREVIEW_THEMES.map((option) => {
          const isActive = option.id === theme;
          return (
            <button
              key={option.id}
              type='button'
              aria-pressed={isActive}
              onClick={() => setTheme(option.id)}
              className={cn(
                "overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/60",
                isActive && "border-primary ring-1 ring-primary",
              )}>
              <img
                src={option.preview}
                alt=''
                loading='lazy'
                className='aspect-[16/9] w-full object-cover object-top-left'
              />
              <div className='space-y-1 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-semibold'>
                    {t(`themes.${option.id}.name`)}
                  </span>
                  {isActive ? (
                    <Badge>
                      <CheckCircleIcon weight='fill' className='mr-1 size-3' />
                      {t("settings.themes.active")}
                    </Badge>
                  ) : (
                    <Badge variant='outline'>
                      {t("settings.themes.inactive")}
                    </Badge>
                  )}
                </div>
                <p className='line-clamp-2 text-muted-foreground text-xs'>
                  {t(`themes.${option.id}.description`)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
};

const ApplicationSection = () => {
  const { t } = useTranslation("preview");
  const { appearance, setAppearance } = usePreviewState();
  return (
    <>
      <Section
        title={t("settings.system.title")}
        description={t("settings.system.description")}>
        <LocalToggle
          label={t("settings.system.autoReapply.label")}
          description={t("settings.system.autoReapply.description")}
          initial
        />
        <LocalToggle
          label={t("settings.system.heroConflict.label")}
          description={t("settings.system.heroConflict.description")}
          initial
        />
        <LocalToggle
          label={t("settings.system.paginated.label")}
          description={t("settings.system.paginated.description")}
          initial={false}
        />
      </Section>
      <Section
        title={t("settings.appearance.title")}
        description={t("settings.appearance.description")}>
        <ToggleRow
          label={t("settings.appearance.geometry.label")}
          description={t("settings.appearance.geometry.description")}
          checked={appearance.geometry}
          onCheckedChange={(geometry) => setAppearance({ geometry })}
        />
        <ToggleRow
          label={t("settings.appearance.animateGeometry.label")}
          description={t("settings.appearance.animateGeometry.description")}
          checked={appearance.animateGeometry}
          onCheckedChange={(animateGeometry) =>
            setAppearance({ animateGeometry })
          }
        />
      </Section>
    </>
  );
};

const DiscordSection = () => {
  const { t } = useTranslation("preview");
  const [enabled, setEnabled] = useState(true);
  return (
    <Section
      title={t("settings.discord.title")}
      description={t("settings.discord.description")}>
      <ToggleRow
        label={t("settings.discord.toggle.label")}
        description={t("settings.discord.toggle.description")}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      <div>
        <p className='font-bold text-sm'>
          {t("settings.discord.preview.title")}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t("settings.discord.preview.description")}
        </p>
        <div
          className={cn(
            "mt-3 flex w-80 items-center gap-3 rounded-lg bg-[#232428] p-3 text-white transition-opacity",
            !enabled && "opacity-40",
          )}>
          <img
            src='/home/heroes/vyper.webp'
            alt=''
            className='size-14 rounded-lg bg-black/30'
          />
          <div className='min-w-0 text-xs leading-snug'>
            <p className='font-semibold text-sm'>Deadlock</p>
            {enabled ? (
              <>
                <p className='truncate'>
                  {t("settings.discord.example.details")}
                </p>
                <p className='truncate text-white/70'>
                  {t("settings.discord.example.state")}
                </p>
              </>
            ) : (
              <p className='text-white/70'>{t("settings.discord.disabled")}</p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
};

const NetworkSection = () => {
  const { t } = useTranslation("preview");
  const [mode, setMode] = useState<"default" | "auto">("default");
  return (
    <Section
      title={t("settings.network.title")}
      description={t("settings.network.description")}>
      <div role='radiogroup' className='grid grid-cols-2 gap-3'>
        {(["default", "auto"] as const).map((option) => (
          <button
            key={option}
            type='button'
            role='radio'
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:border-primary/60",
              mode === option && "border-primary bg-primary/10",
            )}>
            <span className='block font-medium text-sm'>
              {t(`settings.network.${option}.title`)}
            </span>
            <span className='block text-muted-foreground text-xs'>
              {t(`settings.network.${option}.body`)}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
};

type Backup = { id: number; createdAt: number; vpks: number; size: string };

const BackupsSection = () => {
  const { t } = useTranslation("preview");
  const locale = getLocaleConfig(useLocale()).hreflang;
  const { notify, installs } = usePreviewState();
  const [backups, setBackups] = useState<Backup[]>([
    {
      id: 1,
      createdAt: new Date(2026, 8, 28, 21, 14).getTime(),
      vpks: 3,
      size: "412 MB",
    },
  ]);

  const formatBackupDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const createBackup = () => {
    const vpks = Object.values(installs).filter(
      (install) => install.status === "installed",
    ).length;
    setBackups((current) => [
      {
        id: Date.now(),
        createdAt: Date.now(),
        vpks,
        size: `${vpks * 131 + 19} MB`,
      },
      ...current,
    ]);
    notify(
      t("settings.backups.created.title"),
      t("settings.backups.created.description", { total: vpks }),
    );
  };

  return (
    <Section
      title={t("settings.backups.title")}
      description={t("settings.backups.description")}
      action={
        <button
          type='button'
          onClick={createBackup}
          className={buttonVariants()}>
          <ArchiveIcon />
          {t("settings.backups.create")}
        </button>
      }>
      <LocalToggle
        label={t("settings.backups.autoBackup.label")}
        description={t("settings.backups.autoBackup.description")}
        initial
      />
      <table className='w-full text-sm'>
        <thead className='text-left text-muted-foreground text-xs'>
          <tr>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.date")}
            </th>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.vpkFiles")}
            </th>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.size")}
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => {
            const date = formatBackupDate(backup.createdAt);
            return (
              <tr key={backup.id} className='border-border/40 border-t'>
                <td className='py-2'>{date}</td>
                <td className='py-2 tabular-nums'>{backup.vpks}</td>
                <td className='py-2 tabular-nums'>{backup.size}</td>
                <td className='py-2 text-right'>
                  <button
                    type='button'
                    onClick={() =>
                      notify(
                        t("settings.backups.restored.title"),
                        t("settings.backups.restored.description", { date }),
                      )
                    }
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-8 px-3 text-xs",
                    )}>
                    {t("settings.backups.restore")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
};

const GameSection = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  return (
    <>
      <Section
        title={t("settings.game.path.title")}
        description={t("settings.game.path.description")}>
        <div className='flex gap-2'>
          <div className='flex h-9 min-w-0 flex-1 items-center rounded-md border border-input px-3 font-mono text-muted-foreground text-xs'>
            <span className='truncate'>
              C:\Program Files (x86)\Steam\steamapps\common\Deadlock
            </span>
          </div>
          <button
            type='button'
            onClick={() =>
              notify(
                t("settings.game.detected.title"),
                t("settings.game.detected.description"),
              )
            }
            className={buttonVariants({ variant: "outline" })}>
            {t("settings.game.autoDetect")}
          </button>
        </div>
      </Section>
      <Section
        title={t("settings.game.protection.title")}
        description={t("settings.game.protection.description")}>
        <LocalToggle
          label={t("settings.game.blockChanges.label")}
          description={t("settings.game.blockChanges.description")}
          initial
        />
      </Section>
    </>
  );
};

const PrivacySection = () => {
  const { t } = useTranslation("preview");
  return (
    <>
      <Section
        title={t("settings.privacy.title")}
        description={t("settings.privacy.description")}>
        <LocalToggle
          label={t("settings.privacy.hideNsfw.label")}
          description={t("settings.privacy.hideNsfw.description")}
          initial
        />
        <LocalToggle
          label={t("settings.privacy.disableBlur.label")}
          description={t("settings.privacy.disableBlur.description")}
          initial={false}
        />
      </Section>
      <Section title={t("settings.privacy.analytics.title")}>
        <LocalToggle
          label='Google Analytics'
          description={t("settings.privacy.analytics.description")}
          initial={false}
        />
      </Section>
    </>
  );
};

const FolderButton = ({ label }: { label: string }) => (
  <span
    aria-disabled='true'
    className={cn(
      buttonVariants({ variant: "outline" }),
      "pointer-events-none opacity-60",
    )}>
    <FolderOpenIcon />
    {label}
  </span>
);

const LaunchOptionsSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.launchOptions.title")}
      description={t("settings.launchOptions.description")}>
      <LocalToggle
        label={t("settings.launchOptions.vanilla.label")}
        description={t("settings.launchOptions.vanilla.description")}
        initial={false}
      />
      <LocalToggle
        label={t("settings.launchOptions.autoexec.label")}
        description={t("settings.launchOptions.autoexec.description")}
        initial
      />
    </Section>
  );
};

const AutoexecSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title='Autoexec.cfg'
      description={t("settings.autoexec.description")}>
      <div className='rounded-lg border border-border/50 bg-card/50 p-4'>
        <h5 className='font-semibold text-primary'>
          {t("settings.autoexec.whatIs")}
        </h5>
        <p className='mt-2 text-muted-foreground text-sm'>
          {t("settings.autoexec.explanation")}
        </p>
        <p className='mt-2 text-muted-foreground text-sm'>
          {t("settings.autoexec.usage")}
        </p>
      </div>
    </Section>
  );
};

const ToolsSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.tools.title")}
      description={t("settings.tools.description")}>
      <ActionRow
        label={t("settings.tools.openGameFolder.label")}
        description={t("settings.tools.openGameFolder.description")}>
        <FolderButton label={t("settings.tools.open")} />
      </ActionRow>
      <ActionRow
        label={t("settings.tools.clearCache.label")}
        description={t("settings.tools.clearCache.description")}>
        <FolderButton label={t("settings.tools.clear")} />
      </ActionRow>
    </Section>
  );
};

const LoggingSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.logging.title")}
      description={t("settings.logging.description")}>
      <ActionRow
        label={t("settings.logging.logs.label")}
        description={t("settings.logging.logs.description")}>
        <FolderButton label={t("settings.logging.openFolder")} />
      </ActionRow>
      <ActionRow
        label={t("settings.logging.crashDumps.label")}
        description={t("settings.logging.crashDumps.description")}>
        <FolderButton label={t("settings.logging.openLatest")} />
      </ActionRow>
    </Section>
  );
};

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
