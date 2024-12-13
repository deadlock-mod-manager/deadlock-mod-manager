import { cn } from '@/lib/utils'
import { ArrowLineLeft } from '@phosphor-icons/react'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar'

export const SidebarCollapse = () => {
  const { toggleSidebar, open } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggleSidebar}>
        <ArrowLineLeft
          className={cn('transition-all ease-linear duration-150', open ? '' : 'rotate-180')}
          weight="duotone"
        />
        <span>Collapse menu</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
