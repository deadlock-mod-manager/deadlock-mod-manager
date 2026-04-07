// import { Dialog, DialogTrigger } from "@deadlock-mods/ui/components/dialog";
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
  PackageIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useThemeOverride } from "@/components/providers/theme-overrides";
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
  isBottom?: boolean;
  isDev?: boolean;
}

type Groups = "general" | "mods" | "customization" | "developer";

const sidebarItems = ({ t, badgeContext }: SProps): Array<Item> => [
  {
    id: "dashboard",
    title: t("navigation.dashboard"),
    url: "/",
    icon: HouseIcon,
    group: "general",
  },
  {
    id: "downloads",
    title: t("navigation.downloads"),
    url: "/downloads",
    icon: DownloadIcon,
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
    icon: PackageIcon,
    badge: badgeContext?.length || undefined,
    group: "mods",
  },
  {
    id: "get-mods",
    title: t("navigation.getMods"),
    url: "/mods",
    icon: MagnifyingGlassIcon,
    group: "mods",
  },
  {
    id: "settings",
    title: t("navigation.settings"),
    url: "/settings",
    icon: GearIcon,
    group: "general",
  },
  {
    id: "crosshairs",
    title: t("navigation.crosshairs"),
    url: "/crosshairs",
    icon: CrosshairIcon,
    group: "customization",
  },
  {
    id: "autoexec",
    title: t("navigation.autoexec"),
    url: "/settings/autoexec",
    icon: ArticleIcon,
    group: "customization",
  },

  {
    id: "developer",
    title: t("navigation.developer"),
    url: "/developer",
    icon: CodeIcon,
    group: "developer",
  },
  import.meta.env.DEV
    ? {
        id: "debug",
        title: "Debug",
        url: "/debug",
        icon: BugBeetleIcon,
        group: "developer",
      }
    : ({} as Item),
];

export const AppSidebar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const mods = usePersistedStore((state) => state.localMods);
  const developerMode = usePersistedStore((state) => state.developerMode);
  const SidebarContentExtra = useThemeOverride("sidebarContentExtra");
  const SidebarFooterExtra = useThemeOverride("sidebarFooterExtra");

  const groups: Record<Groups, string> = {
    general: "General",
    mods: "Mods",
    customization: "Customization",
    developer: "Developer",
  };

  const items = sidebarItems({ t, badgeContext: mods });
  const topSidebarItems = [...new Set(items.filter((item) => !item.isBottom))];

  return (
    <Sidebar
      className="z-50 flex h-[calc(100vh-96px)] absolute bottom-0 left-0 w-[12rem] flex-col border-t"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarContent className="flex-grow inline pt-2">
        {(Object.keys(groups) as Groups[]).map((group) => {
          const items = topSidebarItems.filter(
            (groupItem) => groupItem.group === group,
          );
          return (
            <SidebarGroup>
              <SidebarGroupLabel>{groups[group]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <Link to={item.url}>
                      <SidebarItem
                        key={item.id}
                        isVisible={item.isDev ? developerMode : true}
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
