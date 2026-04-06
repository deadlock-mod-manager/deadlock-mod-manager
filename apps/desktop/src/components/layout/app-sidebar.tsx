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
  url: string;
  dialog?: React.ComponentType;
  icon?: Icon;
  iconUrl?: string;
  bottom?: boolean;
  group?: string;
};

const getSidebarItems = (
  t: (key: string) => string,
  developerMode: boolean,
  group?: string,
): SidebarItem[] => {
  const allItems: SidebarItem[] = [
    {
      id: "dashboard",
      title: () => <span>{t("navigation.dashboard")}</span>,
      tooltipLabel: t("navigation.dashboard"),
      url: "/",
      icon: HouseIcon,
      group: "general",
    },
    {
      id: "my-mods",
      title: ({ isActive, count }: { isActive?: boolean; count?: number }) => (
        <div className='flex items-center justify-between w-full'>
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
      id: "downloads",
      title: ({ downloads }: { downloads?: number }) => (
        <div className='flex items-center justify-between w-full'>
          {t("navigation.downloads")}{" "}
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
      id: "crosshairs",
      title: () => <span>{t("navigation.crosshairs")}</span>,
      tooltipLabel: t("navigation.crosshairs"),
      url: "/crosshairs",
      icon: CrosshairIcon,
      group: t("navigation.customization"),
    },
    {
      id: "autoexec",
      title: () => <span>{t("navigation.autoexec")}</span>,
      tooltipLabel: t("navigation.autoexec"),
      url: "/settings/autoexec",
      icon: ArticleIcon,
      group: t("navigation.customization"),
    },
    {
      id: "settings",
      title: () => <span>{t("navigation.settings")}</span>,
      tooltipLabel: t("navigation.settings"),
      url: "/settings",
      icon: GearIcon,
      group: "general",
    },
    ...(developerMode
      ? [
          {
            id: "developer",
            title: () => <span>{t("navigation.developer")}</span>,
            tooltipLabel: t("navigation.developer"),
            url: "/developer",
            icon: CodeIcon,
            group: "Developer",
            bottom: true,
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
            bottom: true,
            group: "Developer",
          },
        ]
      : []),
  ];

  if (group) {
    return allItems.filter((item) => item.group === group);
  }

  return allItems;
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

  if (item.dialog) {
    const DialogComponent = item.dialog;
    return (
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild>
          <SidebarMenuButton
            isActive={location.pathname === item.url}
            tooltip={item.tooltipLabel}>
            {renderIcon(item)}
            {item.title({
              isActive: location.pathname === item.url,
              count: item.id === "my-mods" ? mods.length : undefined,
              downloads:
                item.id === "downloads"
                  ? mods.filter(
                      (mod: { status: ModStatus }) =>
                        mod.status === ModStatus.Downloading,
                    ).length
                  : undefined,
            })}
          </SidebarMenuButton>
        </DialogTrigger>
        <DialogComponent />
      </Dialog>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      isActive={location.pathname === item.url}
      tooltip={item.tooltipLabel}>
      <Link to={item.url} draggable='false'>
        {renderIcon(item)}
        {item.title({
          isActive: location.pathname === item.url,
          count: item.id === "my-mods" ? mods.length : undefined,
          downloads:
            item.id === "downloads"
              ? mods.filter(
                  (mod: { status: ModStatus }) =>
                    mod.status === ModStatus.Downloading,
                ).length
              : undefined,
        })}
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

  const allItems = getSidebarItems(t, developerMode).filter(
    (item) => item.id !== "maps" || isCustomMapsEnabled,
  );

  const topItems = allItems.filter((item) => !item.bottom);
  const bottomItems = allItems.filter((item) => item.bottom);

  const topGroups = [...new Set(topItems.map((item) => item.group))].filter(
    Boolean,
  ) as string[];
  const bottomGroups = [
    ...new Set(bottomItems.map((item) => item.group)),
  ].filter(Boolean) as string[];

  const groupLabels: Record<string, string> = {
    mods: "Mods",
    general: "General",
  };

  return (
    <Sidebar
      className='z-50 flex h-[calc(100vh-96px)] absolute bottom-0 left-0 w-[12rem] flex-col border-t'
      collapsible='icon'
      variant='sidebar'>
      <SidebarContent className='flex-grow pt-2'>
        {topGroups.map((group) => {
          const groupItems = topItems.filter((item) => item.group === group);
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>
                {groupLabels[group] || group}
              </SidebarGroupLabel>
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
        {bottomGroups.map((group) => {
          const groupItems = bottomItems.filter((item) => item.group === group);
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>
                {groupLabels[group] || group}
              </SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Separator />
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => openUrl("https://docs.deadlockmods.app/")}
                  tooltip={t("help.documentation")}>
                  <QuestionIcon weight='duotone' />
                  <span>{t("help.documentation")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => openUrl(DISCORD_URL)}
                  tooltip={t("help.needHelp")}>
                  <DiscordLogoIcon weight='duotone' />
                  <span>{t("help.needHelp")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <Separator />
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
