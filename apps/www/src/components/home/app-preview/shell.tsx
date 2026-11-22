import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowLineLeftIcon,
  ArticleIcon,
  CaretUpDownIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  CrosshairIcon,
  DiscordLogoIcon,
  DownloadIcon,
  DownloadSimpleIcon,
  GearIcon,
  HammerIcon,
  HardDrivesIcon,
  HouseIcon,
  type Icon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PackageIcon,
  PlayCircleIcon,
  QuestionIcon,
  SignInIcon,
  SpeakerHighIcon,
  SquareIcon,
  StopIcon,
  TShirtIcon,
  UsersIcon,
  WifiHighIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import Logo from "@/components/logo";
import { DISCORD_URL, DOCS_URL } from "@/lib/constants";
import type { LaunchMode, LaunchState } from "./launch";
import { useInstalledMods, usePreviewState } from "./preview-state";
import { type ScreenId, usePreviewNavigation } from "./store";
import { getPreviewTheme } from "./themes";

type NavItem = { screen: ScreenId; icon: Icon };

// Mirrors the desktop sidebar (apps/desktop/src/components/layout/app-sidebar.tsx).
const NAV_GROUPS = [
  {
    id: "general",
    items: [
      { screen: "dashboard", icon: HouseIcon },
      { screen: "downloads", icon: DownloadIcon },
      { screen: "settings", icon: GearIcon },
    ],
  },
  {
    id: "mods",
    items: [
      { screen: "library", icon: PackageIcon },
      { screen: "store", icon: MagnifyingGlassIcon },
    ],
  },
  {
    id: "customServers",
    items: [{ screen: "servers", icon: HardDrivesIcon }],
  },
  {
    id: "customization",
    items: [
      { screen: "crosshairs", icon: CrosshairIcon },
      { screen: "skins", icon: TShirtIcon },
      { screen: "foundry", icon: HammerIcon },
      { screen: "autoexec", icon: ArticleIcon },
      { screen: "stats", icon: ChartLineUpIcon },
    ],
  },
] as const satisfies readonly { id: string; items: readonly NavItem[] }[];

// Mod Foundry is a product name and stays in English.
const screenLabels = (t: TFunction<"preview">) =>
  ({
    dashboard: t("sidebar.items.dashboard"),
    downloads: t("sidebar.items.downloads"),
    settings: t("sidebar.items.settings"),
    library: t("sidebar.items.library"),
    store: t("sidebar.items.store"),
    servers: t("sidebar.items.servers"),
    crosshairs: t("sidebar.items.crosshairs"),
    skins: t("sidebar.items.skins"),
    foundry: "Mod Foundry",
    autoexec: t("sidebar.items.autoexec"),
    stats: t("sidebar.items.stats"),
  }) satisfies Record<ScreenId, string>;

const sidebarButtonClassName =
  "flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-5 [&>svg]:shrink-0";

// Click feedback, same fill sweep as the desktop toolbar.
const sweepClassName = (active: boolean) =>
  cn(
    "absolute inset-0 origin-left motion-reduce:transition-none",
    active
      ? "scale-x-100 transition-transform duration-500 ease-in-out"
      : "scale-x-0",
  );

export const Titlebar = ({
  launchState,
  enabledCount,
  onLaunch,
  onStop,
}: {
  launchState: LaunchState;
  enabledCount: number;
  onLaunch: (mode: LaunchMode) => void;
  onStop: () => void;
}) => {
  const { t } = useTranslation("preview");
  const running = launchState.phase === "running";
  const launching = launchState.phase === "launching" ? launchState.mode : null;

  return (
    <div className='relative z-20 flex w-full items-center justify-between border-b bg-background [.theme-chrome-clear_&]:bg-transparent'>
      <div className='flex min-w-0 flex-1 items-stretch'>
        <div className='flex w-60 shrink-0 items-center py-1.5 pr-3 pl-1.5'>
          <div className='group relative flex h-7 min-w-0 items-stretch overflow-hidden rounded-md border border-primary/20 bg-linear-to-r from-primary/[0.05] via-background/40 to-primary/[0.03] shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.06)] hover:border-primary/35'>
            <span className='-left-1/2 -skew-x-12 pointer-events-none absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-primary/[0.08] to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100' />
            <span className='flex h-full items-center gap-2 rounded-l-md px-2.5'>
              <UsersIcon className='size-3.5 text-muted-foreground' />
              <span className='truncate font-primary text-sm leading-none tracking-wide'>
                {t("titlebar.profile")}
              </span>
              <CaretUpDownIcon
                weight='bold'
                className='size-3 text-muted-foreground/50'
              />
            </span>
          </div>
        </div>
        <div className='flex flex-1 items-center gap-1.5 py-1.5 pr-3'>
          <div className='ml-auto flex items-center gap-1.5'>
            <button
              type='button'
              disabled={running}
              onClick={() => onLaunch("vanilla")}
              className='relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-md border border-input bg-background px-2.5 font-medium text-xs transition-colors enabled:hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50'>
              <span
                className={cn(
                  sweepClassName(launching === "vanilla"),
                  "bg-foreground/10",
                )}
              />
              <PlayCircleIcon className='relative size-3.5' />
              <span className='relative'>{t("titlebar.launchVanilla")}</span>
            </button>
            <button
              type='button'
              onClick={() => (running ? onStop() : onLaunch("modded"))}
              className='relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-md border border-transparent bg-primary px-2.5 font-medium text-primary-foreground text-xs transition-colors hover:bg-secondary-foreground'>
              <span
                className={cn(
                  sweepClassName(launching === "modded"),
                  "bg-primary-foreground/15",
                )}
              />
              {running ? (
                <>
                  <StopIcon className='relative size-3.5' />
                  <span className='relative'>{t("titlebar.stopGame")}</span>
                </>
              ) : (
                <>
                  <PlayCircleIcon className='relative size-3.5' />
                  <span className='relative'>{t("titlebar.launchModded")}</span>
                  <span className='relative inline-flex items-center gap-1 tabular-nums'>
                    <span aria-hidden='true' className='opacity-60'>
                      ·
                    </span>
                    {t("titlebar.enabledMods", { total: enabledCount })}
                  </span>
                </>
              )}
            </button>
            <span className='mx-0.5 h-4 w-px bg-border' />
            <span className='inline-flex h-7 items-center gap-1.5 px-2.5 font-medium text-muted-foreground text-xs'>
              <SignInIcon className='size-4' />
              {t("titlebar.signIn")}
            </span>
          </div>
        </div>
      </div>
      <div
        aria-hidden='true'
        className='flex items-center gap-3 px-3 text-foreground/60 [&_svg]:size-3.5'>
        <MinusIcon />
        <SquareIcon />
        <XIcon />
      </div>
    </div>
  );
};

export const Sidebar = ({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) => {
  const { t } = useTranslation("preview");
  const { screen, setScreen, theme } = usePreviewNavigation();
  const installedCount = useInstalledMods().length;
  const { icon } = getPreviewTheme(theme);
  const labels = screenLabels(t);

  return (
    <nav
      aria-label={t("sidebar.label")}
      className={cn(
        "flex shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [.theme-chrome-clear_&]:bg-transparent",
        collapsed ? "w-12" : "w-60",
      )}>
      <div
        className={cn(
          "flex items-center gap-2.5 py-5",
          collapsed ? "justify-center" : "pl-3.5",
        )}>
        {icon ? (
          <img
            src={icon}
            alt=''
            className={cn(
              "shrink-0 object-contain",
              collapsed ? "size-7" : "size-9",
            )}
          />
        ) : (
          <Logo className={cn("shrink-0", collapsed ? "size-7" : "size-9")} />
        )}
        {!collapsed && (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='truncate font-primary text-xl leading-none tracking-tight'>
              Deadlock Mod Manager
            </span>
            <span className='text-muted-foreground text-xs'>
              <Trans
                t={t}
                i18nKey='sidebar.byline'
                values={{ version: "v2.0.0" }}
                components={{ version: <span className='tabular-nums' /> }}
              />
            </span>
          </div>
        )}
      </div>

      <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className='flex flex-col px-2'>
            <div
              className={cn(
                "flex shrink-0 items-center overflow-hidden rounded-md px-2 font-medium text-sidebar-foreground/70 text-xs transition-opacity duration-200",
                collapsed ? "h-0 opacity-0" : "h-8",
              )}>
              {t(`sidebar.groups.${group.id}`)}
            </div>
            <ul className='flex flex-col gap-1'>
              {group.items.map((item: NavItem) => {
                const isActive = item.screen === screen;
                const label = labels[item.screen];
                return (
                  <li key={item.screen}>
                    <button
                      type='button'
                      title={collapsed ? label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setScreen(item.screen)}
                      className={cn(
                        sidebarButtonClassName,
                        isActive &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground [.theme-lovelock_&]:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.7),0_0_14px_hsl(var(--primary)/0.25)]",
                        collapsed && "size-8 justify-center p-0",
                      )}>
                      <item.icon weight='duotone' />
                      <span
                        className={cn(
                          "flex flex-1 items-center justify-between",
                          collapsed && "sr-only",
                        )}>
                        {label}
                        {item.screen === "library" && (
                          <Badge
                            variant={isActive ? "inverted" : "default"}
                            className='px-1 py-0 text-xs tabular-nums'>
                            {installedCount}
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className='mt-auto flex flex-col gap-1 px-2 pt-4'>
          {[
            {
              href: DOCS_URL,
              label: t("sidebar.documentation"),
              icon: QuestionIcon,
            },
            {
              href: DISCORD_URL,
              label: t("sidebar.needHelp"),
              icon: DiscordLogoIcon,
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target='_blank'
              rel='noopener noreferrer'
              title={collapsed ? link.label : undefined}
              className={cn(
                sidebarButtonClassName,
                collapsed && "size-8 justify-center p-0",
              )}>
              <link.icon weight='duotone' />
              <span className={cn(collapsed && "sr-only")}>{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className='mx-2 mt-2 border-sidebar-border border-t py-2'>
        <button
          type='button'
          onClick={onToggleCollapsed}
          className={cn(
            sidebarButtonClassName,
            collapsed && "size-8 justify-center p-0",
          )}>
          <ArrowLineLeftIcon
            className={cn(
              "transition-transform duration-300",
              collapsed && "rotate-180",
            )}
          />
          <span className={cn(collapsed && "sr-only")}>
            {collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          </span>
        </button>
      </div>
    </nav>
  );
};

export const BottomBar = () => {
  const { t } = useTranslation("preview");
  const { installs } = usePreviewState();
  const downloading = Object.values(installs).filter(
    (install) => install.status === "downloading",
  ).length;

  return (
    <div className='relative z-30 flex h-8 w-full shrink-0 items-center justify-between border-t bg-background pr-3 pl-4 text-muted-foreground text-xs [.theme-chrome-clear_&]:bg-transparent'>
      <div className='flex items-center gap-1.5'>
        <span>{t("bottomBar.status")}</span>
        {[
          { label: t("bottomBar.statuses.online"), icon: WifiHighIcon },
          { label: t("bottomBar.statuses.signedIn"), icon: LockSimpleIcon },
          { label: t("bottomBar.statuses.mirror"), icon: HardDrivesIcon },
          { label: t("bottomBar.statuses.heroData"), icon: CheckCircleIcon },
        ].map((status) => (
          <span key={status.label} title={status.label} className='p-0.5'>
            <status.icon className='size-3.5 text-primary' />
          </span>
        ))}
        <span className='p-0.5'>
          <DiscordLogoIcon className='size-3.5' />
        </span>
        {downloading > 0 && (
          <span className='ml-2 inline-flex items-center gap-1'>
            <DownloadSimpleIcon className='size-3 animate-pulse text-blue-500' />
            {t("bottomBar.downloading", { total: downloading })}
          </span>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <span className='mx-1 h-3 w-px bg-border' />
        <span className='flex items-center gap-1 px-1 py-0.5'>
          <SpeakerHighIcon className='size-3' />
          {t("bottomBar.volume")}{" "}
          <span className='w-9 text-right tabular-nums'>50%</span>
        </span>
        <span className='mx-1 h-3 w-px bg-border' />
        <span className='flex h-5 items-center gap-1 px-2'>
          <CloudArrowDownIcon className='size-3' />
          {t("bottomBar.checkUpdates")}
        </span>
      </div>
    </div>
  );
};

export const PreviewToast = () => {
  const { toast } = usePreviewState();
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role='status'
      className='absolute right-4 bottom-12 z-40 flex w-80 animate-dl-rise gap-3 rounded-lg border bg-popover p-4 shadow-[0_20px_40px_rgba(0,0,0,0.5)]'>
      <CheckCircleIcon
        weight='fill'
        className='mt-0.5 size-5 shrink-0 text-emerald-400'
      />
      <div>
        <div className='font-semibold text-sm'>{toast.title}</div>
        <div className='mt-0.5 text-muted-foreground text-xs'>
          {toast.description}
        </div>
      </div>
    </div>
  );
};
