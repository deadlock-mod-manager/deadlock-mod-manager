import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@deadlock-mods/ui/components/sidebar";
import { ArrowLineLeft } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const SidebarCollapse = () => {
  const { t } = useTranslation();
  const { toggleSidebar, open } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggleSidebar}>
        <ArrowLineLeft
          className={cn(
            "transition-all duration-150 ease-linear",
            open ? "" : "rotate-180",
          )}
          weight='duotone'
        />
        <span>{t("navigation.collapseMenu")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
