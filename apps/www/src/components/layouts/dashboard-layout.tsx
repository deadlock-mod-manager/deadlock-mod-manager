import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deadlock-mods/ui/components/breadcrumb";
import {
  DashboardSidebar,
  DashboardSidebarContent,
  DashboardSidebarFooter,
  DashboardSidebarGroup,
  DashboardSidebarGroupContent,
  DashboardSidebarGroupLabel,
  DashboardSidebarHeader,
  DashboardSidebarInset,
  DashboardSidebarMenu,
  DashboardSidebarMenuButton,
  DashboardSidebarMenuItem,
  DashboardSidebarProvider,
  DashboardSidebarTrigger,
} from "@deadlock-mods/ui/components/dashboard-sidebar";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Megaphone } from "lucide-react";
import * as React from "react";
import Logo from "@/components/logo";
import UserMenu from "@/components/user-menu";
import { APP_NAME } from "@/lib/constants";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  {
    title: "Home",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Announcements",
    url: "/dashboard/announcements",
    icon: Megaphone,
  },
] as const;

function getBreadcrumbs(pathname: string) {
  const breadcrumbs: Array<{ label: string; href: string }> = [];

  if (pathname === "/dashboard") {
    breadcrumbs.push({ label: "Dashboard", href: "/dashboard" });
  } else if (pathname.startsWith("/dashboard/")) {
    breadcrumbs.push({ label: "Dashboard", href: "/dashboard" });

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 1) {
      const currentItem = navigationItems.find((item) => item.url === pathname);
      if (currentItem) {
        breadcrumbs.push({
          label: currentItem.title,
          href: currentItem.url,
        });
      }
    }
  }

  return breadcrumbs;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const breadcrumbs = getBreadcrumbs(location.pathname);

  return (
    <DashboardSidebarProvider>
      <DashboardSidebar collapsible='icon' variant='inset'>
        <DashboardSidebarHeader className='border-b border-sidebar-border'>
          <div className='flex items-center gap-2 px-2 py-2'>
            <Logo className='h-6 w-auto' />
            <span className='font-bold text-sm group-data-[collapsible=icon]:hidden'>
              {APP_NAME}
            </span>
          </div>
        </DashboardSidebarHeader>
        <DashboardSidebarContent>
          <DashboardSidebarGroup>
            <DashboardSidebarGroupLabel>Navigation</DashboardSidebarGroupLabel>
            <DashboardSidebarGroupContent>
              <DashboardSidebarMenu>
                {navigationItems.map((item) => {
                  const isActive =
                    location.pathname === item.url ||
                    (item.url !== "/dashboard" &&
                      location.pathname.startsWith(item.url));
                  return (
                    <DashboardSidebarMenuItem key={item.url}>
                      <DashboardSidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon className='h-5 w-5' />
                          <span>{item.title}</span>
                        </Link>
                      </DashboardSidebarMenuButton>
                    </DashboardSidebarMenuItem>
                  );
                })}
              </DashboardSidebarMenu>
            </DashboardSidebarGroupContent>
          </DashboardSidebarGroup>
        </DashboardSidebarContent>
        <DashboardSidebarFooter className='border-t border-sidebar-border p-2'>
          <div className='flex items-center justify-between w-full'>
            <UserMenu />
          </div>
        </DashboardSidebarFooter>
      </DashboardSidebar>
      <DashboardSidebarInset>
        <header className='flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
          <div className='flex items-center gap-2 px-4'>
            <DashboardSidebarTrigger className='-ml-1' />
            <Separator
              orientation='vertical'
              className='mr-2 data-[orientation=vertical]:h-4'
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.href}>
                    {index > 0 && (
                      <BreadcrumbSeparator className='hidden md:block' />
                    )}
                    <BreadcrumbItem
                      className={index === 0 ? "hidden md:block" : ""}>
                      {index === breadcrumbs.length - 1 ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <main className='flex-1 overflow-auto'>{children}</main>
      </DashboardSidebarInset>
    </DashboardSidebarProvider>
  );
}
