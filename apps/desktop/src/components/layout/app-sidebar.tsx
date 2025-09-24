import {
  BugBeetleIcon,
  DiscordLogo,
  Download,
  Gear,
  type Icon,
  InfoIcon,
  MagnifyingGlass,
  Package,
  Sparkle,
  UploadSimple,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useWhatsNew } from "@/hooks/use-whats-new";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { AboutDialog } from "./about-dialog";
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
  icon: Icon;
  bottom?: boolean;
};

const getSidebarItems = (t: (key: string) => string): SidebarItem[] => [
  {
    id: "my-mods",
    title: ({ isActive, count }: { isActive?: boolean; count?: number }) => (
      <div className='flex items-center gap-2'>
        {t("navigation.myMods")}{" "}
        {count !== undefined && (
          <Badge
            className='px-1 py-0.1 text-xs'
            variant={isActive ? "inverted" : "default"}>
            {count}
          </Badge>
        )}
      </div>
    ),
    url: "/",
    icon: Package,
  },
  {
    id: "get-mods",
    title: () => <span>{t("navigation.getMods")}</span>,
    url: "/mods",
    icon: MagnifyingGlass,
  },
  {
    id: "add-mods",
    title: () => <span>{t("navigation.addMods")}</span>,
    url: "/add-mods",
    icon: UploadSimple,
  },
  {
    id: "downloads",
    title: ({ downloads }: { downloads?: number }) => (
      <span>
        {t("navigation.downloads")}{" "}
        {downloads !== undefined && downloads > 0 && (
          <Badge className='px-1 py-0.1 text-xs'>{downloads}</Badge>
        )}
      </span>
    ),
    url: "/downloads",
    icon: Download,
  },
  {
    id: "settings",
    title: () => <span>{t("navigation.settings")}</span>,
    url: "/settings",
    icon: Gear,
    bottom: true,
  },
  {
    id: "about",
    title: () => <span>{t("navigation.about")}</span>,
    url: "/about",
    icon: InfoIcon,
    dialog: AboutDialog,
    bottom: true,
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: "debug",
          title: () => <span>Debug</span>,
          url: "/debug",
          icon: BugBeetleIcon,
          bottom: true,
        },
      ]
    : []),
];

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
            <item.icon weight='duotone' />
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
        <item.icon weight='duotone' />
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
  const { forceShow } = useWhatsNew();

  const items = getSidebarItems(t);

  return (
    <Sidebar
      className='absolute top-10 left-0 z-50 flex h-[calc(100vh-40px)] w-[12rem] flex-col border-t'
      collapsible='icon'
      variant='sidebar'>
      <SidebarContent className='flex-grow'>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items
                .filter((item) => !item.bottom)
                .map((item) => (
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items
                .filter((item) => item.bottom)
                .map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarItemComponent
                      item={item}
                      location={location}
                      mods={mods}
                    />
                  </SidebarMenuItem>
                ))}
              <Separator />
              <SidebarMenuItem>
                <SidebarMenuButton
                  className='cursor-pointer'
                  onClick={() => forceShow()}>
                  <Sparkle weight='duotone' />
                  <span>{t("navigation.whatsNew")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className='cursor-pointer'
                  onClick={() => open("https://discord.gg/WbFNt8CCr8")}>
                  <DiscordLogo weight='duotone' />
                  <span>{t("help.needHelp")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
