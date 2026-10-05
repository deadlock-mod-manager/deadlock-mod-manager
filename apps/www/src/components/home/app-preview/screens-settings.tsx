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
import { useState } from "react";
import { usePreviewState } from "./preview-state";
import { type SettingsSectionId, usePreviewNavigation } from "./store";
import { PREVIEW_THEMES } from "./themes";

// Copy below comes from the desktop app's English locale (settings.*).
const NAV: {
  label: string;
  items: { id: SettingsSectionId; label: string; icon: Icon }[];
}[] = [
  {
    label: "Game",
    items: [
      { id: "launch-options", label: "Launch Options", icon: GearIcon },
      { id: "autoexec", label: "Autoexec.cfg", icon: ArticleIcon },
      { id: "game", label: "Game", icon: GameControllerIcon },
    ],
  },
  {
    label: "Application",
    items: [
      { id: "application", label: "Application", icon: MonitorIcon },
      { id: "themes", label: "Themes", icon: PaletteIcon },
      { id: "network", label: "Network", icon: GlobeIcon },
      { id: "discord", label: "Discord", icon: DiscordLogoIcon },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "tools", label: "Tools", icon: WrenchIcon },
      { id: "backups", label: "Backups", icon: ArchiveIcon },
      { id: "logging", label: "Logging", icon: ScrollIcon },
      { id: "privacy", label: "Privacy", icon: ShieldIcon },
    ],
  },
];

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
  const { theme, setTheme } = usePreviewNavigation();
  return (
    <Section
      flat
      title='Themes'
      description='Choose from carefully crafted themes designed to enhance your experience.'>
      <div className='inline-flex w-fit rounded-lg bg-muted p-1 text-sm'>
        <span className='rounded-md bg-background px-3 py-1 font-medium shadow'>
          Pre-defined Themes
        </span>
        <span className='px-3 py-1 text-muted-foreground'>Custom Themes</span>
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
                  <span className='font-semibold'>{option.name}</span>
                  {isActive ? (
                    <Badge>
                      <CheckCircleIcon weight='fill' className='mr-1 size-3' />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant='outline'>Inactive</Badge>
                  )}
                </div>
                <p className='line-clamp-2 text-muted-foreground text-xs'>
                  {option.description}
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
  const { appearance, setAppearance } = usePreviewState();
  return (
    <>
      <Section
        title='System Settings'
        description='Mod Manager Settings. These do not affect the game.'>
        <LocalToggle
          label='Auto-Reapply Mods'
          description='Automatically reapply mods when the mod manager is launched.'
          initial
        />
        <LocalToggle
          label='Hero Conflict Warning'
          description='Show a warning when enabling a second mod for a hero that already has an active mod.'
          initial
        />
        <LocalToggle
          label='Paginated Browsing'
          description='Show the Mods Store and Library as pages instead of one continuous scrolling list.'
          initial={false}
        />
      </Section>
      <Section
        title='Appearance'
        description='Customize the appearance of the application.'>
        <ToggleRow
          label='Occult geometry'
          description='Show the decorative occult sigils and mandalas in the background.'
          checked={appearance.geometry}
          onCheckedChange={(geometry) => setAppearance({ geometry })}
        />
        <ToggleRow
          label='Animate occult geometry'
          description='Slowly rotate and pulse the background sigils.'
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
  const [enabled, setEnabled] = useState(true);
  return (
    <Section
      title='Discord Game Presence'
      description='Show your live Deadlock status via Discord Rich Presence, such as current hero, match mode, party size, and more.'>
      <ToggleRow
        label='Discord Game Presence'
        description='Customize how Deadlock appears on your Discord profile.'
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      <div>
        <p className='font-bold text-sm'>Preview</p>
        <p className='text-muted-foreground text-sm'>
          See how your Discord status will look with example values.
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
                <p className='truncate'>Sleep Walking in the Hideout</p>
                <p className='truncate text-white/70'>
                  Playing Standard (6v6) · 3 of 6
                </p>
              </>
            ) : (
              <p className='text-white/70'>Discord Game Presence Disabled</p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
};

const NetworkSection = () => {
  const [mode, setMode] = useState<"default" | "auto">("default");
  return (
    <Section
      title='Download routing'
      description='Choose how mod downloads connect to GameBanana file servers. Default uses the standard download link from the API.'>
      <div role='radiogroup' className='grid grid-cols-2 gap-3'>
        {(
          [
            {
              id: "default",
              title: "Default",
              body: "Standard download link from the API",
            },
            {
              id: "auto",
              title: "Automatic",
              body: "Best latency or throughput",
            },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type='button'
            role='radio'
            aria-checked={mode === option.id}
            onClick={() => setMode(option.id)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:border-primary/60",
              mode === option.id && "border-primary bg-primary/10",
            )}>
            <span className='block font-medium text-sm'>{option.title}</span>
            <span className='block text-muted-foreground text-xs'>
              {option.body}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
};

type Backup = { id: number; date: string; vpks: number; size: string };

const BackupsSection = () => {
  const { notify, installs } = usePreviewState();
  const [backups, setBackups] = useState<Backup[]>([
    { id: 1, date: "Sep 28, 2026, 9:14 PM", vpks: 3, size: "412 MB" },
  ]);

  const createBackup = () => {
    const vpks = Object.values(installs).filter(
      (install) => install.status === "installed",
    ).length;
    const date = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    setBackups((current) => [
      { id: Date.now(), date, vpks, size: `${vpks * 131 + 19} MB` },
      ...current,
    ]);
    notify("Backup created successfully", `${vpks} VPK files saved.`);
  };

  return (
    <Section
      title='Mods Backup'
      description='Create and restore backups of your installed mods.'
      action={
        <button
          type='button'
          onClick={createBackup}
          className={buttonVariants()}>
          <ArchiveIcon />
          Create Backup
        </button>
      }>
      <LocalToggle
        label='Auto-backup before updates'
        description='Automatically create a backup of your mods before batch updating mods'
        initial
      />
      <table className='w-full text-sm'>
        <thead className='text-left text-muted-foreground text-xs'>
          <tr>
            <th className='pb-2 font-medium'>Date</th>
            <th className='pb-2 font-medium'>VPK Files</th>
            <th className='pb-2 font-medium'>Size</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.id} className='border-border/40 border-t'>
              <td className='py-2'>{backup.date}</td>
              <td className='py-2 tabular-nums'>{backup.vpks}</td>
              <td className='py-2 tabular-nums'>{backup.size}</td>
              <td className='py-2 text-right'>
                <button
                  type='button'
                  onClick={() =>
                    notify(
                      "Backup restored successfully",
                      `Restored the backup from ${backup.date}.`,
                    )
                  }
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-8 px-3 text-xs",
                  )}>
                  Restore
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
};

const GameSection = () => {
  const { notify } = usePreviewState();
  return (
    <>
      <Section
        title='Game Path'
        description='The path to your Deadlock game installation. The mod manager will auto-detect this, but you can manually set it if needed.'>
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
                "Game path auto-detected successfully",
                "Found Deadlock in your Steam library.",
              )
            }
            className={buttonVariants({ variant: "outline" })}>
            Auto-Detect
          </button>
        </div>
      </Section>
      <Section
        title='Protection while playing'
        description='What the mod manager does when you change mods with Deadlock open.'>
        <LocalToggle
          label='Block changes while Deadlock runs'
          description='Refuses to install, remove or reorder mods while the game is open, because Deadlock holds those files and a half-applied change can break your load order.'
          initial
        />
      </Section>
    </>
  );
};

const PrivacySection = () => (
  <>
    <Section
      title='Privacy & Content'
      description='Control how NSFW (Not Safe For Work) content is displayed and filtered.'>
      <LocalToggle
        label='Hide NSFW Content'
        description='Completely hide mods marked as NSFW from lists and search results'
        initial
      />
      <LocalToggle
        label='Disable NSFW Blur'
        description='Show NSFW content without any blur effect (content still shows NSFW badge)'
        initial={false}
      />
    </Section>
    <Section title='Usage Analytics'>
      <LocalToggle
        label='Google Analytics'
        description='Help improve the application by sending anonymous usage statistics and feature analytics'
        initial={false}
      />
    </Section>
  </>
);

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

const SECTIONS = {
  "launch-options": () => (
    <Section
      title='Launch Options'
      description='Customize the launch options for the game. These are applied regardless of the game mode selected (Vanilla or Modded).'>
      <LocalToggle
        label='Vanilla Mode'
        description='Launch the game in vanilla mode without additional arguments.'
        initial={false}
      />
      <LocalToggle
        label='Autoexec Config'
        description='Run your autoexec.cfg when the game starts.'
        initial
      />
    </Section>
  ),
  autoexec: () => (
    <Section
      title='Autoexec.cfg'
      description='Manage your autoexec.cfg file. Changes require game restart.'>
      <div className='rounded-lg border border-border/50 bg-card/50 p-4'>
        <h5 className='font-semibold text-primary'>
          What&apos;s an Autoexec Config?
        </h5>
        <p className='mt-2 text-muted-foreground text-sm'>
          Autoexec is a CFG file for launching a game with set convars (think
          console command) that will get automatically executed on launch of the
          game.
        </p>
        <p className='mt-2 text-muted-foreground text-sm'>
          The mod manager uses this file to set the crosshair settings
          automatically without needing to run commands in the console. You can
          still edit the file manually if you want to add more commands.
        </p>
      </div>
    </Section>
  ),
  game: () => <GameSection />,
  application: () => <ApplicationSection />,
  themes: () => <ThemesSection />,
  network: () => <NetworkSection />,
  discord: () => <DiscordSection />,
  tools: () => (
    <Section
      title='Tools'
      description='Utility functions for managing your mods'>
      <ActionRow
        label='Open Game Folder'
        description='Opens your Deadlock install in your file manager.'>
        <FolderButton label='Open' />
      </ActionRow>
      <ActionRow
        label='Clear Download Cache'
        description='Removes cached download files. Your installed mods are not affected.'>
        <FolderButton label='Clear' />
      </ActionRow>
    </Section>
  ),
  backups: () => <BackupsSection />,
  logging: () => (
    <Section
      title='Logging'
      description='Access log files for troubleshooting issues.'>
      <ActionRow
        label='Mod Manager Logs'
        description='Application logs for debugging issues.'>
        <FolderButton label='Open Folder' />
      </ActionRow>
      <ActionRow
        label='Deadlock Crash Dumps'
        description='Crash dumps generated when Deadlock crashes for debugging.'>
        <FolderButton label='Open Latest' />
      </ActionRow>
    </Section>
  ),
  privacy: () => <PrivacySection />,
} satisfies Record<SettingsSectionId, () => React.ReactNode>;

export const SettingsScreen = () => {
  const { settingsSection, setSettingsSection } = usePreviewNavigation();

  return (
    <div className='flex flex-col gap-4 pb-6'>
      <div className='px-4 pt-4'>
        <h3 className='font-bold text-2xl'>Settings</h3>
      </div>
      <div className='flex gap-6'>
        <nav
          aria-label='Settings sections'
          className='sticky top-0 w-52 shrink-0 self-start p-2'>
          {NAV.map((group) => (
            <div key={group.label} className='flex flex-col gap-0.5'>
              <p className='px-3 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-wider'>
                {group.label}
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
                    {item.label}
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
