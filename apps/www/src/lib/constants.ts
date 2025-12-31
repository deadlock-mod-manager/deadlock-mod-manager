import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { SITE_URL } from "./config";

export const DISCORD_URL = "https://discord.gg/WbFNt8CCr8";
export const GITHUB_REPO = "https://github.com/Stormix/deadlock-modmanager";
export const DOWNLOAD_URL = `${GITHUB_REPO}/releases/latest`;
export const REDDIT_URL = "https://www.reddit.com/r/DeadlockModManager/";
export const X_URL = "https://x.com/DLModManager";
export const APP_NAME = "Deadlock Mod Manager";
export const COPYRIGHT = `© 2024-${new Date().getFullYear()} | ${APP_NAME}`;
export { SITE_URL };
export const STATUS_URL = "https://status.deadlockmods.app";
export const DOCS_URL = "https://docs.deadlockmods.app";

export const social = [
  {
    name: "GitHub",
    href: GITHUB_REPO,
    icon: PhosphorIcons.GithubLogoIcon,
  },
  {
    name: "Discord",
    href: DISCORD_URL,
    icon: PhosphorIcons.DiscordLogoIcon,
  },
  {
    name: "Reddit",
    href: REDDIT_URL,
    icon: PhosphorIcons.RedditLogoIcon,
  },
  {
    name: "X (Twitter)",
    href: X_URL,
    icon: PhosphorIcons.TwitterLogoIcon,
  },
];
