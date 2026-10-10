import { PhosphorIcons } from "@deadlock-mods/ui/icons";

export const DISCORD_URL = "https://discord.gg/WbFNt8CCr8";
export const GITHUB_REPO =
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager";
export const GITHUB_ISSUES_URL = `${GITHUB_REPO}/issues`;
export const BUG_REPORT_URL = `${GITHUB_ISSUES_URL}/new?labels=bug&template=bug-report---.md`;
/**
 * Latest GitHub release. Stays an absolute GitHub URL because the /download
 * page itself falls back to it when the releases API is down.
 */
export const DOWNLOAD_URL = `${GITHUB_REPO}/releases/latest`;
/** Rolling nightly build, the public preview of V2 until it ships as stable. */
export const V2_PREVIEW_URL = `${GITHUB_REPO}/releases/tag/nightly`;
export const REDDIT_URL = "https://www.reddit.com/r/DeadlockModManager/";
export const X_URL = "https://x.com/DLModManager";
export const APP_NAME = "Deadlock Mod Manager";
export const COPYRIGHT = `© 2024-${new Date().getFullYear()} | ${APP_NAME}`;
export const SITE_URL = "https://deadlockmods.app";
/** Shareable link to the downloads page, for visitors on a phone or Mac. */
export const DOWNLOAD_PAGE_URL = `${SITE_URL}/download`;
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

const partnerUtm =
  "utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners";

export const PARTNERS = [
  {
    name: "GameBanana",
    href: `https://gamebanana.com/?${partnerUtm}`,
    logo: "/home/partners/gamebanana.svg",
  },
  {
    name: "Deadlocker",
    href: `https://deadlocker.net/?${partnerUtm}`,
    logo: "/home/partners/deadlocker.webp",
  },
  {
    name: "Deadlock API",
    href: `https://deadlock-api.com/?${partnerUtm}`,
    logo: "/home/partners/deadlock-api.webp",
  },
  {
    name: "Deadworks",
    href: `https://deadworks.net/?${partnerUtm}`,
    logo: "/home/partners/deadworks.webp",
  },
];
