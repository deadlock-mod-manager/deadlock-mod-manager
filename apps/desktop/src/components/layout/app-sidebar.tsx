import { Badge } from "@deadlock-mods/ui/components/badge";
import { Dialog, DialogTrigger } from "@deadlock-mods/ui/components/dialog";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@deadlock-mods/ui/components/sidebar";
import {
  BugBeetleIcon,
  ChartLineUpIcon,
  CodeIcon,
  CrosshairIcon,
  DownloadIcon,
  FlagIcon,
  GaugeIcon,
  GearIcon,
  HammerIcon,
  HardDrivesIcon,
  HouseIcon,
  type Icon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  PackageIcon,
  PuzzlePieceIcon,
  QuestionIcon,
  TShirtIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { PluginTile, pluginGlyph } from "@/components/plugins/plugin-identity";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useExternalPlugins } from "@/hooks/use-external-plugins";
import { isDownloadInProgress } from "@/lib/download/status";
import { usePersistedStore } from "@/lib/store";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { BrandingHeader } from "./branding";
import { SidebarCollapse } from "./sidebar-collapse";
import { SidebarSocials } from "./sidebar-socials";

type SidebarItem = {
  id: string;
  title: ({
    isActive,
    count,
    downloads,
  }: {
    isActive?: boolean;
    count?: number;
    downloads?: number;
  }) => React.ReactNode;
  tooltipLabel: string;
  url?: string;
  external?: string;
  dialog?: React.ComponentType;
  icon?: Icon;
  iconUrl?: string;
  /** An external plugin's own glyph tile instead of an icon. */
  pluginTile?: Pick<ExternalPluginSummary, "icon" | "accent">;
  className?: string;
  group: string;
  /** Shows a "New" badge until the user opens the page. */
  isNew?: boolean;
  /** Also active on pages nested under `url`, such as a single match under Stats. */
  activeOnChildren?: boolean;
};

const GROUP_ORDER = [
  "general",
  "mods",
  "multiplayer",
  "customization",
  "plugins",
  "developer",
] as const;

type GroupId = (typeof GROUP_ORDER)[number];

const getSidebarItems = (
  t: (key: string) => string,
  developerMode: boolean,
): SidebarItem[] => {
  return [
    {
      id: "dashboard",
      title: () => <span>{t("navigation.dashboard")}</span>,
      tooltipLabel: t("navigation.dashboard"),
      url: "/",
      icon: HouseIcon,
      group: "general",
    },
    {
      id: "downloads",
      title: ({ downloads }) => (
        <div className='flex w-full items-center justify-between'>
          <span>{t("navigation.downloads")}</span>
          {downloads !== undefined && downloads > 0 && (
            <Badge className='px-1 py-0.1 text-xs'>{downloads}</Badge>
          )}
        </div>
      ),
      tooltipLabel: t("navigation.downloads"),
      url: "/downloads",
      icon: DownloadIcon,
      group: "general",
    },
    {
      id: "settings",
      title: () => <span>{t("navigation.settings")}</span>,
      tooltipLabel: t("navigation.settings"),
      url: "/settings",
      icon: GearIcon,
      group: "general",
    },
    {
      id: "my-mods",
      title: ({ isActive, count }) => (
        <div className='flex w-full items-center justify-between'>
          <span>{t("navigation.myMods")}</span>
          {count !== undefined && (
            <Badge
              className='px-1 py-0.1 text-xs'
              variant={isActive ? "inverted" : "default"}>
              {count}
            </Badge>
          )}
        </div>
      ),
      tooltipLabel: t("navigation.myMods"),
      url: "/my-mods",
      icon: PackageIcon,
      group: "mods",
    },
    {
      id: "get-mods",
      title: () => <span>{t("navigation.getMods")}</span>,
      tooltipLabel: t("navigation.getMods"),
      url: "/mods",
      icon: MagnifyingGlassIcon,
      group: "mods",
    },
    {
      id: "maps",
      title: () => <span>{t("navigation.maps")}</span>,
      tooltipLabel: t("navigation.maps"),
      url: "/maps",
      icon: MapTrifoldIcon,
      group: "mods",
    },
    {
      id: "servers",
      title: () => <span>{t("navigation.servers")}</span>,
      tooltipLabel: t("navigation.servers"),
      url: "/servers",
      icon: HardDrivesIcon,
      group: "multiplayer",
    },
    {
      id: "crosshairs",
      title: () => <span>{t("navigation.crosshairs")}</span>,
      tooltipLabel: t("navigation.crosshairs"),
      url: "/crosshairs",
      icon: CrosshairIcon,
      group: "customization",
    },
    {
      id: "skins",
      title: () => <span>{t("navigation.skins")}</span>,
      tooltipLabel: t("navigation.skins"),
      url: "/skins",
      icon: TShirtIcon,
      group: "customization",
    },
    {
      id: "foundry",
      title: () => <span>{t("navigation.foundry")}</span>,
      tooltipLabel: t("navigation.foundry"),
      url: "/foundry",
      icon: HammerIcon,
      group: "customization",
      isNew: true,
    },
    {
      id: "performance",
      title: () => <span>{t("navigation.performance")}</span>,
      tooltipLabel: t("navigation.performance"),
      url: "/performance",
      icon: GaugeIcon,
      group: "customization",
      isNew: true,
    },
    {
      id: "stats",
      title: () => <span>{t("navigation.stats")}</span>,
      tooltipLabel: t("navigation.stats"),
      url: "/stats",
      icon: ChartLineUpIcon,
      group: "customization",
      isNew: true,
      activeOnChildren: true,
    },
    ...(developerMode
      ? [
          {
            id: "developer",
            title: () => <span>{t("navigation.developer")}</span>,
            tooltipLabel: t("navigation.developer"),
            url: "/developer",
            icon: CodeIcon,
            group: "developer" as const,
          },
        ]
      : []),
    ...(import.meta.env.DEV
      ? [
          {
            id: "debug",
            title: () => <span>{t("debug.title")}</span>,
            tooltipLabel: t("debug.title"),
            url: "/debug",
            icon: BugBeetleIcon,
            group: "developer" as const,
          },
        ]
      : []),
    {
      id: "documentation",
      title: () => <span>{t("help.documentation")}</span>,
      tooltipLabel: t("help.documentation"),
      external: "https://docs.deadlockmods.app/",
      icon: QuestionIcon,
      group: "developer",
    },
    {
      id: "experimental",
      title: () => (
        <span className='flex min-w-0 flex-1 items-center gap-3'>
          <span>{t("settings.experimental")}</span>
          <span className='experimental-tour-nudge ml-auto flex shrink-0 items-center gap-1 text-primary group-data-[collapsible=icon]:hidden'>
            <svg
              aria-hidden
              viewBox='0 0 30 18'
              className='experimental-tour-nudge-arrow h-4 w-6'
              fill='none'>
              <path
                d='M27 5C20 13 12 13 3 9M3 9l6-5M3 9l7 5'
                stroke='currentColor'
                strokeWidth='1.5'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
            {t("experimentalTour.tryMe")}
          </span>
        </span>
      ),
      tooltipLabel: t("settings.experimental"),
      url: "/settings/experimental",
      icon: FlagIcon,
      group: "developer",
    },
  ];
};

/** The sidebar dot for a plugin that needs the user: stopped, unset or waiting on an update. */
const pluginAttentionColor = (plugin: ExternalPluginSummary) => {
  if (plugin.status === "quarantined") return TONE_COLOR.danger;
  if (plugin.status === "needsConsent") return TONE_COLOR.warn;
  if (plugin.pendingUpdate) return TONE_COLOR.info;
  return null;
};

// Group labels hide when the sidebar collapses to icons, so a short rule keeps sections apart.
const CollapsedSeparator = () => (
  <Separator className='mx-auto mb-2 hidden w-4 bg-sidebar-border group-data-[collapsible=icon]:block' />
);

type SidebarItemProps = {
  item: SidebarItem;
  location: ReturnType<typeof useLocation>;
  modCount: number;
  downloadCount: number;
  showNewBadge: boolean;
};

const NewBadge = () => {
  const { t } = useTranslation();
  return (
    <Badge className='ml-auto px-1 py-0.1 text-[10px] uppercase tracking-wide group-data-[collapsible=icon]:hidden'>
      {t("navigation.new")}
    </Badge>
  );
};

const renderIcon = (item: SidebarItem, isActive: boolean) => {
  if (item.pluginTile) {
    if (!isActive) {
      return (
        <PluginTile
          accent={item.pluginTile.accent}
          fillAlpha={18}
          glyphSize={12}
          icon={item.pluginTile.icon}
          radius={5}
          size={18}
        />
      );
    }
    const Glyph = pluginGlyph(item.pluginTile.icon);
    return (
      <span
        aria-hidden
        className='flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[#00000022]'>
        <Glyph size={12} />
      </span>
    );
  }
  if (item.icon) {
    return <item.icon weight='duotone' />;
  }
  if (item.iconUrl) {
    return <img alt='' className='h-5 w-5' src={item.iconUrl} />;
  }
  return null;
};

const SidebarItemComponent = ({
  item,
  location,
  modCount,
  downloadCount,
  showNewBadge,
}: SidebarItemProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const titleProps = {
    isActive: item.url
      ? location.pathname === item.url ||
        (item.activeOnChildren === true &&
          location.pathname.startsWith(`${item.url}/`))
      : false,
    count: item.id === "my-mods" ? modCount : undefined,
    downloads: item.id === "downloads" ? downloadCount : undefined,
  };

  if (item.dialog) {
    const DialogComponent = item.dialog;
    return (
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild>
          <SidebarMenuButton
            isActive={titleProps.isActive}
            tooltip={item.tooltipLabel}>
            {renderIcon(item, titleProps.isActive)}
            {item.title(titleProps)}
          </SidebarMenuButton>
        </DialogTrigger>
        <DialogComponent />
      </Dialog>
    );
  }

  if (item.external) {
    return (
      <SidebarMenuButton
        onClick={() => openUrl(item.external as string)}
        tooltip={item.tooltipLabel}>
        {renderIcon(item, titleProps.isActive)}
        {item.title(titleProps)}
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      className={item.className}
      isActive={titleProps.isActive}
      tooltip={item.tooltipLabel}>
      <Link
        draggable='false'
        to={
          item.id === "experimental"
            ? "/settings/experimental?tour=1"
            : (item.url ?? "/")
        }>
        {renderIcon(item, titleProps.isActive)}
        {item.title(titleProps)}
        {showNewBadge && <NewBadge />}
      </Link>
    </SidebarMenuButton>
  );
};

export const AppSidebar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const modCount = usePersistedStore((state) => state.localMods.length);
  const downloadCount = usePersistedStore(
    (state) =>
      state.localMods.filter((mod) => isDownloadInProgress(mod.status)).length,
  );
  const seenNavItems = usePersistedStore((state) => state.seenNavItems);
  const markNavItemSeen = usePersistedStore((state) => state.markNavItemSeen);
  const developerMode = usePersistedStore((state) => state.developerMode);
  const SidebarContentExtra = useThemeOverride("sidebarContentExtra");
  const SidebarFooterExtra = useThemeOverride("sidebarFooterExtra");
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const isPlayerStatsEnabled = usePersistedStore(
    (state) => state.playerStatsEnabled,
  );
  const isModFoundryEnabled = useExperimentalFeature("mod-foundry");
  const isPerformanceEnabled = useExperimentalFeature("performance-configs");
  const isPluginsEnabled = useExperimentalFeature("plugins");

  const externalPlugins = useExternalPlugins();
  const pluginItems: SidebarItem[] = [
    ...(externalPlugins.data ?? [])
      .filter((plugin) => plugin.hasUi)
      .map((plugin) => {
        const dot = pluginAttentionColor(plugin);
        return {
          id: `external-plugin:${plugin.id}`,
          title: () => (
            <span className='flex min-w-0 flex-1 items-center gap-2.5'>
              <span className='truncate'>{plugin.name}</span>
              {dot ? (
                <span
                  className='ml-auto size-1.5 shrink-0 rounded-full'
                  style={{ backgroundColor: dot }}
                />
              ) : null}
            </span>
          ),
          tooltipLabel: plugin.name,
          url: `/ext/${plugin.id}`,
          pluginTile: plugin,
          className: "gap-2.5",
          group: "plugins",
        };
      }),
    {
      id: "manage-plugins",
      title: () => <span>{t("plugins.page.managePlugins")}</span>,
      tooltipLabel: t("plugins.page.managePlugins"),
      url: "/plugins/manage",
      icon: PuzzlePieceIcon,
      group: "plugins",
    },
  ];

  const allItems = [
    ...getSidebarItems(t, developerMode),
    ...(isPluginsEnabled ? pluginItems : []),
  ].filter(
    (item) =>
      (item.id !== "maps" || isCustomMapsEnabled) &&
      (item.id !== "stats" || isPlayerStatsEnabled) &&
      (item.id !== "foundry" || isModFoundryEnabled) &&
      (item.id !== "performance" || isPerformanceEnabled),
  );

  useEffect(() => {
    const visited = allItems.find(
      (item) => item.isNew && item.url === location.pathname,
    );
    if (visited && !seenNavItems[visited.id]) markNavItemSeen(visited.id);
  }, [allItems, location.pathname, markNavItemSeen, seenNavItems]);

  const groupLabels = {
    general: t("navigation.general", "General"),
    mods: t("navigation.mods", "Mods"),
    multiplayer: t("navigation.multiplayer"),
    customization: t("navigation.customization"),
    plugins: t("navigation.plugins"),
    developer: t("navigation.developer", "Developer"),
  } satisfies Record<GroupId, string>;

  return (
    <Sidebar
      className='absolute inset-y-0 left-0'
      collapsible='icon'
      variant='sidebar'>
      <SidebarHeader className='py-2 pl-2 group-data-[collapsible=icon]:p-0'>
        <BrandingHeader />
      </SidebarHeader>
      <SidebarContent className='flex-grow'>
        {GROUP_ORDER.map((group) => {
          const groupItems = allItems.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <SidebarGroup
              className={
                group === "developer" ? "mt-auto shrink-0" : "shrink-0"
              }
              key={group}>
              {group === "developer" ? (
                <>
                  {SidebarFooterExtra ? <SidebarFooterExtra /> : null}
                  {SidebarContentExtra ? <SidebarContentExtra /> : null}
                </>
              ) : null}
              {group !== GROUP_ORDER[0] ? <CollapsedSeparator /> : null}
              <SidebarGroupLabel>{groupLabels[group]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {groupItems.map((item) => {
                    const entry = (
                      <SidebarItemComponent
                        item={item}
                        location={location}
                        modCount={modCount}
                        downloadCount={downloadCount}
                        showNewBadge={!!item.isNew && !seenNavItems[item.id]}
                      />
                    );
                    return (
                      <SidebarMenuItem key={item.id}>
                        {item.id === "servers" ? (
                          <HintAnchor
                            hintId='server-browser'
                            onShowMe={() => navigate("/servers")}
                            side='right'>
                            <div>{entry}</div>
                          </HintAnchor>
                        ) : (
                          entry
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapsedSeparator />
              <SidebarSocials />
              <Separator />
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
