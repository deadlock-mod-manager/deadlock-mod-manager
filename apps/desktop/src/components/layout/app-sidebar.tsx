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
  ArticleIcon,
  BugBeetleIcon,
  CodeIcon,
  CrosshairIcon,
  DiscordLogoIcon,
  DownloadIcon,
  GearIcon,
  HardDrivesIcon,
  HouseIcon,
  type Icon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  PackageIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { DISCORD_URL } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import BrandingHeader from "./branding";
import { SidebarCollapse } from "./sidebar-collapse";

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
  group: string;
};

const GROUP_ORDER = [
  "general",
  "mods",
  "multiplayer",
  "customization",
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
      id: "autoexec",
      title: () => <span>{t("navigation.autoexec")}</span>,
      tooltipLabel: t("navigation.autoexec"),
      url: "/settings/autoexec",
      icon: ArticleIcon,
      group: "customization",
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
            title: () => <span>Debug</span>,
            tooltipLabel: "Debug",
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
      id: "need-help",
      title: () => <span>{t("help.needHelp")}</span>,
      tooltipLabel: t("help.needHelp"),
      external: DISCORD_URL,
      icon: DiscordLogoIcon,
      group: "developer",
    },
  ];
};

type SidebarItemProps = {
  item: SidebarItem;
  location: ReturnType<typeof useLocation>;
  mods: Array<{ status: ModStatus; remoteId: string }>;
};

const renderIcon = (item: SidebarItem) => {
  if (item.icon) {
    return <item.icon weight='duotone' />;
  }
  if (item.iconUrl) {
    return <img alt='' className='h-5 w-5' src={item.iconUrl} />;
  }
  return null;
};

const SidebarItemComponent = ({ item, location, mods }: SidebarItemProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const titleProps = {
    isActive: item.url ? location.pathname === item.url : false,
    count: item.id === "my-mods" ? mods.length : undefined,
    downloads:
      item.id === "downloads"
        ? mods.filter(
            (mod) =>
              mod.status === ModStatus.Downloading ||
              mod.status === ModStatus.Extracting ||
              mod.status === ModStatus.Paused,
          ).length
        : undefined,
  };

  if (item.dialog) {
    const DialogComponent = item.dialog;
    return (
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild>
          <SidebarMenuButton
            isActive={titleProps.isActive}
            tooltip={item.tooltipLabel}>
            {renderIcon(item)}
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
        {renderIcon(item)}
        {item.title(titleProps)}
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      isActive={titleProps.isActive}
      tooltip={item.tooltipLabel}>
      <Link draggable='false' to={item.url ?? "/"}>
        {renderIcon(item)}
        {item.title(titleProps)}
      </Link>
    </SidebarMenuButton>
  );
};

export const AppSidebar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const mods = usePersistedStore((state) => state.localMods);
  const developerMode = usePersistedStore((state) => state.developerMode);
  const SidebarContentExtra = useThemeOverride("sidebarContentExtra");
  const SidebarFooterExtra = useThemeOverride("sidebarFooterExtra");
  const { isEnabled: isCustomMapsEnabled } = useFeatureFlag(
    "custom-maps",
    false,
  );
  const { isEnabled: isServerBrowserEnabled } = useFeatureFlag(
    "server-browser",
    false,
  );

  const allItems = getSidebarItems(t, developerMode).filter(
    (item) =>
      (item.id !== "maps" || isCustomMapsEnabled) &&
      (item.id !== "servers" || isServerBrowserEnabled),
  );

  const groupLabels: Record<GroupId, string> = {
    general: t("navigation.general", "General"),
    mods: t("navigation.mods", "Mods"),
    multiplayer: t("navigation.multiplayer"),
    customization: t("navigation.customization"),
    developer: t("navigation.developer", "Developer"),
  };

  return (
    <Sidebar
      className='absolute inset-y-0 left-0'
      collapsible='icon'
      variant='sidebar'>
      <SidebarHeader className='pl-2 py-2'>
        <BrandingHeader />
      </SidebarHeader>
      <SidebarContent className='flex-grow'>
        {GROUP_ORDER.map((group) => {
          const groupItems = allItems.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <SidebarGroup
              className={group === "developer" ? "mt-auto" : undefined}
              key={group}>
              <SidebarGroupLabel>{groupLabels[group]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {groupItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarItemComponent
                        item={item}
                        location={location}
                        mods={mods}
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {SidebarContentExtra ? <SidebarContentExtra /> : null}
      </SidebarContent>
      <SidebarFooter>
        {SidebarFooterExtra ? <SidebarFooterExtra /> : null}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Separator />
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
