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
  Article,
  BugBeetleIcon,
  Code,
  Crosshair,
  DiscordLogo,
  Download,
  Gear,
  House,
  type Icon,
  MagnifyingGlass,
  Package,
  Question,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { DISCORD_URL } from "@/lib/constants";
import { getPluginAssetUrl } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { ThemeSettings } from "@/plugins/themes";
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
  url: string;
  dialog?: React.ComponentType;
  icon?: Icon;
  iconUrl?: string;
  bottom?: boolean;
  group?: string;
};

const teaMascotUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/tea/fumo_dog.png",
);

const getSidebarItems = (
  t: (key: string) => string,
  developerMode: boolean,
  group?: string,
): SidebarItem[] => {
  const allItems: SidebarItem[] = [
    {
      id: "dashboard",
      title: () => <span>{t("navigation.dashboard")}</span>,
      url: "/",
      icon: House,
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
      url: "/my-mods",
      icon: Package,
      group: "mods",
    },
    {
      id: "get-mods",
      title: () => <span>{t("navigation.getMods")}</span>,
      url: "/mods",
      icon: MagnifyingGlass,
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
      url: "/downloads",
      icon: Download,
      group: "general",
    },
    {
      id: "crosshairs",
      title: () => <span>{t("navigation.crosshairs")}</span>,
      url: "/crosshairs",
      icon: Crosshair,
      group: t("navigation.customization"),
    },
    {
      id: "autoexec",
      title: () => <span>{t("navigation.autoexec")}</span>,
      url: "/settings/autoexec",
      icon: Article,
      group: t("navigation.customization"),
    },
    {
      id: "settings",
      title: () => <span>{t("navigation.settings")}</span>,
      url: "/settings",
      icon: Gear,
      group: "general",
    },
    ...(developerMode
      ? [
          {
            id: "developer",
            title: () => <span>{t("navigation.developer")}</span>,
            url: "/developer",
            icon: Code,
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

const SidebarItemComponent = ({ item, location, mods }: SidebarItemProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (item.dialog) {
    const DialogComponent = item.dialog;
    return (
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild>
          <SidebarMenuButton
            className='cursor-pointer'
            isActive={location.pathname === item.url}>
            {item.icon ? (
              <item.icon weight='duotone' />
            ) : item.iconUrl ? (
              <img alt='' className='h-5 w-5' src={item.iconUrl} />
            ) : null}
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
    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
      <Link to={item.url}>
        {item.icon ? (
          <item.icon weight='duotone' />
        ) : item.iconUrl ? (
          <img alt='' className='h-5 w-5' src={item.iconUrl} />
        ) : null}
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
  const themesEnabled = usePersistedStore(
    (state) => state.enabledPlugins.themes ?? false,
  );
  const themeSettings = usePersistedStore((state) => {
    return state.pluginSettings.themes as ThemeSettings | undefined;
  });

  const showTeaMascot = themesEnabled && themeSettings?.activeTheme === "tea";

  const allItems = getSidebarItems(t, developerMode);

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
        {showTeaMascot ? (
          <div className='group-data-[collapsible=icon]:hidden mt-auto flex justify-center px-3 pb-4'>
            <img
              alt={t("accessibility.snipzteaMascotAlt")}
              className='max-w-[160px] w-full rounded-md object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]'
              src={teaMascotUrl}
            />
          </div>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
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
                  className='cursor-pointer'
                  onClick={() => open("https://docs.deadlockmods.app/")}>
                  <Question weight='duotone' />
                  <span>{t("help.documentation")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className='cursor-pointer'
                  onClick={() => open(DISCORD_URL)}>
                  <DiscordLogo weight='duotone' />
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
