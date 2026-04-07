import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarItem,
  SidebarMenu,
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
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { DISCORD_URL } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { LocalMod, ModStatus } from "@/types/mods";
import { SidebarCollapse } from "./sidebar-collapse";

interface SProps {
  t: (key: string) => string;
  badgeContext?: LocalMod[];
}

interface Item {
  id: string;
  title: string;
  icon: Icon;
  url: string;
  group: Groups;
  badge?: string | number;
  isFooter?: boolean;
  tooltipLabel?: string;
  isDev?: boolean;
  isVisible?: (isVisible: boolean) => boolean | boolean;
}

type Groups = "general" | "mods" | "customization" | "developer";

const sidebarItems = ({ t, badgeContext }: SProps): Array<Item> => [
  {
    id: "dashboard",
    title: t("navigation.dashboard"),
    url: "/",
    tooltipLabel: t("navigation.dashboard"),
    icon: HouseIcon,
    group: "general",
  },
  {
    id: "downloads",
    title: t("navigation.downloads"),
    url: "/downloads",
    icon: DownloadIcon,
    tooltipLabel: t("navigation.downloads"),
    group: "general",
    badge:
      badgeContext?.filter(
        (mod: { status: ModStatus }) => mod.status === ModStatus.Downloading,
      ).length || undefined,
  },
  {
    id: "my-mods",
    title: t("navigation.myMods"),
    url: "/my-mods",
    tooltipLabel: t("navigation.myMods"),
    icon: PackageIcon,
    badge: badgeContext?.length || undefined,
    group: "mods",
  },
  {
    id: "get-mods",
    tooltipLabel: t("navigation.getMods"),
    title: t("navigation.getMods"),
    url: "/mods",
    icon: MagnifyingGlassIcon,
    group: "mods",
  },
  {
    id: "settings",
    title: t("navigation.settings"),
    tooltipLabel: t("navigation.settings"),
    url: "/settings",
    icon: GearIcon,
    group: "general",
  },
  {
    id: "maps",
    title: t("navigation.maps"),
    tooltipLabel: t("navigation.maps"),
    url: "/maps",
    isVisible: (flag) => flag,
    icon: MapTrifoldIcon,
    group: "mods",
  },
  {
    id: "crosshairs",
    title: t("navigation.crosshairs"),
    tooltipLabel: t("navigation.crosshairs"),
    url: "/crosshairs",
    icon: CrosshairIcon,
    group: "customization",
  },
  {
    id: "autoexec",
    title: t("navigation.autoexec"),
    url: "/settings/autoexec",
    tooltipLabel: t("navigation.autoexec"),
    icon: ArticleIcon,
    group: "customization",
  },

  {
    id: "developer",
    title: t("navigation.developer"),
    url: "/developer",
    tooltipLabel: "navigation.developer",
    icon: CodeIcon,
    isDev: true,
    group: "developer",
    isFooter: true,
  },
  import.meta.env.DEV
    ? {
        id: "debug",
        title: "Debug",
        url: "/debug",
        isFooter: true,
        icon: BugBeetleIcon,
        group: "developer",
      }
    : ({} as Item),
];

const AppSidebar = () => {
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

  const groups: Record<
    Groups,
    {
      label: string;
      position: "footer" | "general";
    }
  > = {
    general: {
      label: "General",
      position: "general",
    },
    mods: {
      label: "Mods",
      position: "general",
    },
    customization: {
      label: "Customization",
      position: "general",
    },
    developer: {
      label: "Developer",
      position: "footer",
    },
  };

  const getItemVisibility = (item: Item) => {
    if (item.isDev) return developerMode;

    if (typeof item.isVisible === "function") {
      return item.isVisible(!!isCustomMapsEnabled);
    }

    return item.isVisible;
  };

  const items = sidebarItems({ t, badgeContext: mods });

  const generalGroups = (Object.keys(groups) as Groups[]).filter(
    (group) => groups[group].position === "general",
  );
  const footerGroups = (Object.keys(groups) as Groups[]).filter(
    (group) => groups[group].position === "footer",
  );

  const topSidebarItems = [...new Set(items.filter((item) => !item.isFooter))];

  const footerSidebarItems = [
    ...new Set(items.filter((item) => item.isFooter)),
  ];

  return (
    <Sidebar
      className="z-50 flex h-[calc(100vh-96px)] absolute bottom-0 left-0 w-[12rem] flex-col border-t"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarContent className="flex-grow inline pt-2">
        {generalGroups.map((group) => {
          const items = topSidebarItems.filter(
            (groupItem) => groupItem.group === group,
          );

          return (
            <SidebarGroup className="pb-1">
              <SidebarGroupLabel>{groups[group].label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <Link to={item.url}>
                      <SidebarItem
                        tooltip={item.tooltipLabel}
                        key={item.id}
                        isVisible={getItemVisibility(item)}
                        isActive={item.url === location.pathname}
                        title={item.title}
                        badge={item.badge}
                        icon={
                          <item.icon className="h-5 w-5" weight="duotone" />
                        }
                      />
                    </Link>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {SidebarContentExtra ? <SidebarContentExtra /> : null}
      </SidebarContent>
      <SidebarFooter className="min-h-fit">
        {SidebarFooterExtra ? <SidebarFooterExtra /> : null}
        <SidebarGroup className="group-data-[collapsible=icon]:pb-0">
          <SidebarGroupContent>
            {footerGroups.map((group) => {
              const items = footerSidebarItems.filter(
                (groupItem) => groupItem.group === group,
              );

              if (!items.length) return null;

              return (
                <div className="pb-1">
                  <SidebarGroupLabel>{groups[group].label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.map((item) => (
                        <Link to={item.url}>
                          <SidebarItem
                            tooltip={item.tooltipLabel}
                            key={item.id}
                            isActive={item.url === location.pathname}
                            title={item.title}
                            isVisible={getItemVisibility(item)}
                            badge={item.badge}
                            icon={
                              <item.icon className="h-5 w-5" weight="duotone" />
                            }
                          />
                        </Link>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </div>
              );
            })}
            <Separator />
            <SidebarMenu className="py-1">
              <SidebarItem
                icon={<QuestionIcon className="w-5 h-5" weight="duotone" />}
                title={t("help.documentation")}
                onClick={() => openUrl("https://docs.deadlockmods.app/")}
              />
              <SidebarItem
                icon={<DiscordLogoIcon className="w-5 h-5" weight="duotone" />}
                title={t("help.needHelp")}
                onClick={() => openUrl(DISCORD_URL)}
              />
              <Separator />
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
export default AppSidebar;
