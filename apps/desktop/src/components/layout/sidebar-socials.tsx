import {
  SidebarMenuItem,
  useSidebar,
} from "@deadlock-mods/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  DiscordLogoIcon,
  type Icon,
  RedditLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { DISCORD_URL, REDDIT_URL, X_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Social = {
  id: string;
  name: string;
  tooltipKey: string;
  url: string;
  icon: Icon;
  hoverClassName: string;
};

const SOCIALS: Social[] = [
  {
    id: "discord",
    name: "Discord",
    tooltipKey: "help.socials.discord",
    url: DISCORD_URL,
    icon: DiscordLogoIcon,
    hoverClassName: "hover:text-[oklch(0.62_0.19_277)]",
  },
  {
    id: "x",
    name: "X",
    tooltipKey: "help.socials.x",
    url: X_URL,
    icon: XLogoIcon,
    hoverClassName: "hover:text-sidebar-accent-foreground",
  },
  {
    id: "reddit",
    name: "Reddit",
    tooltipKey: "help.socials.reddit",
    url: REDDIT_URL,
    icon: RedditLogoIcon,
    hoverClassName: "hover:text-[oklch(0.66_0.21_38)]",
  },
];

export const SidebarSocials = () => {
  const { t } = useTranslation();
  const { open } = useSidebar();

  return (
    <SidebarMenuItem className='flex items-center justify-center gap-1 group-data-[collapsible=icon]:flex-col'>
      {SOCIALS.map((social) => (
        <Tooltip key={social.id}>
          <TooltipTrigger asChild>
            <button
              aria-label={social.name}
              className={cn(
                "group/social flex size-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/60 outline-none ring-sidebar-ring transition-colors duration-200 hover:bg-sidebar-accent focus-visible:ring-2 active:bg-sidebar-accent",
                social.hoverClassName,
              )}
              onClick={() => openUrl(social.url)}
              type='button'>
              <social.icon
                className='size-5 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] motion-safe:group-hover/social:-translate-y-0.5 motion-safe:group-hover/social:scale-110 motion-safe:group-active/social:translate-y-0 motion-safe:group-active/social:scale-95'
                weight='duotone'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side={open ? "top" : "right"}>
            {t(social.tooltipKey)}
          </TooltipContent>
        </Tooltip>
      ))}
    </SidebarMenuItem>
  );
};
