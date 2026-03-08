import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { InfoIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import logger from "@/lib/logger";

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: typeof InfoIcon;
    label: string;
    variant: "default" | "destructive" | "secondary";
  }
> = {
  maintenance: { icon: WrenchIcon, label: "Maintenance", variant: "default" },
  downtime: { icon: WarningIcon, label: "Downtime", variant: "destructive" },
  info: { icon: InfoIcon, label: "Info", variant: "secondary" },
};

const DEFAULT_CATEGORY = CATEGORY_CONFIG.info;

export const getCategoryConfig = (category: string) =>
  CATEGORY_CONFIG[category] ?? DEFAULT_CATEGORY;

export const getAnnouncementDate = (announcement: AnnouncementDto) =>
  new Date(announcement.publishedAt || announcement.createdAt || new Date());

export const handleOpenLink = (url: string) => {
  openUrl(url).catch((err) => {
    logger.error("Failed to open announcement link", err);
  });
};

export const AnnouncementIcon = ({
  announcement,
  size = "sm",
}: {
  announcement: AnnouncementDto;
  size?: "sm" | "md";
}) => {
  const sizeClasses = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const iconSizeClasses = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  if (announcement.iconUrl) {
    return (
      <img
        alt={announcement.title}
        className={`${sizeClasses} shrink-0 rounded object-cover`}
        src={announcement.iconUrl}
      />
    );
  }

  const { icon: IconComponent } = getCategoryConfig(announcement.category);
  return (
    <div
      className={`${sizeClasses} shrink-0 rounded bg-muted flex items-center justify-center`}>
      <IconComponent className={iconSizeClasses} weight='duotone' />
    </div>
  );
};

export const CategoryBadge = ({
  category,
  className,
}: {
  category: string;
  className?: string;
}) => {
  const config = getCategoryConfig(category);
  return (
    <Badge variant={config.variant} className={`shrink-0 ${className ?? ""}`}>
      {config.label}
    </Badge>
  );
};
