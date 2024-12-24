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
import { Download, Gear, Icon, MagnifyingGlass, Package } from '@phosphor-icons/react';
import { Link, useLocation } from 'react-router';
import { SidebarCollapse } from './sidebar-collapse';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

type SidebarItem = {
  id: string;
  title: ({ isActive, count }: { isActive?: boolean; count?: number }) => React.ReactNode;
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
    title: () => <span>Downloads</span>,
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
                        count: item.id === 'my-mods' ? mods.length : undefined
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
              <Separator />
              <SidebarCollapse />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
};
