import { SidebarItem, useSidebar } from "@deadlock-mods/ui/components/sidebar";
import { ArrowLineLeftIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
export const SidebarCollapse = () => {
  const { t } = useTranslation();
  const { toggleSidebar, open } = useSidebar();
  return (
    <SidebarItem
      icon={
        <ArrowLineLeftIcon
          className={cn(
            "transition-all duration-150 w-5 h-5 ease-linear",
            open ? "" : "rotate-180",
          )}
          weight="duotone"
        />
      }
      title={t("navigation.collapseMenu")}
      tooltip={t(open ? "navigation.collapseMenu" : "navigation.expandMenu")}
      onClick={toggleSidebar}
    />
  );
};
