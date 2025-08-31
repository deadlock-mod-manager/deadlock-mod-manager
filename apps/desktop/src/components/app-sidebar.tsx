import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';
import { DiscordLogo, Download, Gear, Icon, MagnifyingGlass, Package } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-shell';
import { Link, useLocation } from 'react-router';
import { SidebarCollapse } from './sidebar-collapse';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';

type SidebarItem = {
  id: string;
  title: ({
    isActive,
    count,
    downloads
  }: {
    isActive?: boolean;
    count?: number;
    downloads?: number;
  }) => React.ReactNode;
  url: string;
  icon: Icon;
};

const items: SidebarItem[] = [
  {
    id: 'my-mods',
    title: ({ isActive, count }: { isActive?: boolean; count?: number }) => (
      <div className="flex items-center gap-2">
        My mods{' '}
        {count !== undefined && (
          <Badge className="text-xs px-1 py-0.1" variant={isActive ? 'inverted' : 'default'}>
            {count}
          </Badge>
        )}
      </div>
    ),
    url: '/',
    icon: Package
  },
  {
    id: 'get-mods',
    title: () => <span>Get mods</span>,
    url: '/mods',
    icon: MagnifyingGlass
  },
  {
    id: 'downloads',
    title: ({ downloads }: { downloads?: number }) => (
      <span>
        Downloads{' '}
        {downloads !== undefined && downloads > 0 && <Badge className="text-xs px-1 py-0.1">{downloads}</Badge>}
      </span>
    ),
    url: '/downloads',
    icon: Download
  },
  {
    id: 'settings',
    title: () => <span>Settings</span>,
    url: '/settings',
    icon: Gear
  }
];

const DownloadProgress = () => {
  const mods = usePersistedStore((state) => state.mods);
  const modProgress = usePersistedStore((state) => state.modProgress);

  const downloadingMods = mods.filter((mod) => mod.status === ModStatus.DOWNLOADING);
  if (downloadingMods.length === 0) return null;

  // Calculate the combined progress of all downloads
  let totalProgress = 0;
  let modsWithProgress = 0;

  downloadingMods.forEach((mod) => {
    const progress = modProgress[mod.remoteId];
    if (progress && progress.percentage && !isNaN(progress.percentage) && isFinite(progress.percentage)) {
      totalProgress += progress.percentage;
      modsWithProgress++;
    }
  });

  const averageProgress = modsWithProgress > 0 ? totalProgress / modsWithProgress : 0;
  const displayPercentage = isNaN(averageProgress) || !isFinite(averageProgress) ? 0 : Math.round(averageProgress);

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1 text-xs">
        <span>
          Downloading {downloadingMods.length} mod{downloadingMods.length !== 1 ? 's' : ''}
        </span>
        <span>{displayPercentage}%</span>
      </div>
      <Progress value={displayPercentage} className="h-1" />
    </div>
  );
};

export const AppSidebar = () => {
  const location = useLocation();
  const mods = usePersistedStore((state) => state.mods);
  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="absolute top-10 left-0 h-[calc(100vh-40px)] flex flex-col z-10 w-[12rem]"
    >
      <SidebarContent className="flex-grow">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <Link to={item.url}>
                      <item.icon weight="duotone" />
                      {item.title({
                        isActive: location.pathname === item.url,
                        count: item.id === 'my-mods' ? mods.length : undefined,
                        downloads:
                          item.id === 'downloads'
                            ? mods.filter((mod) => mod.status === ModStatus.DOWNLOADING).length
                            : undefined
                      })}
                    </Link>
                  </SidebarMenuButton>
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
              <DownloadProgress />
              <Separator />
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => open('https://discord.gg/KSB2kzQWWE')}
                  className="cursor-pointer"
                >
                  <DiscordLogo weight="duotone" />
                  <span>Need Help ?</span>
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
