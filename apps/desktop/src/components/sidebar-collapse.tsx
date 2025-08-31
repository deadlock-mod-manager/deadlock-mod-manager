import { ArrowLineLeft } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar';

export const SidebarCollapse = () => {
  const { toggleSidebar, open } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggleSidebar}>
        <ArrowLineLeft
          className={cn(
            'transition-all duration-150 ease-linear',
            open ? '' : 'rotate-180'
          )}
          weight="duotone"
        />
        <span>Collapse menu</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
