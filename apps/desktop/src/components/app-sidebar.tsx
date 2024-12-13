import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Download, Gear, MagnifyingGlass, Package } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { SidebarCollapse } from './sidebar-collapse'
import { Separator } from './ui/separator'

// Menu items.
const items = [
  {
    title: 'My mods',
    url: '/',
    icon: Package
  },
  {
    title: 'Get mods',
    url: '/mods',
    icon: MagnifyingGlass
  },
  {
    title: 'Downloads',
    url: '/downloads',
    icon: Download
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Gear
  }
]

export const AppSidebar = () => {
  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="absolute top-10 left-0 h-[calc(100vh-40px)] flex flex-col z-10"
    >
      <SidebarContent className="flex-grow">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url}>
                      <item.icon weight="duotone" />
                      <span className="">{item.title}</span>
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
  )
}
