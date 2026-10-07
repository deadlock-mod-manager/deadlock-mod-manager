/**
 * Search-landing pages, linked from the footer and from each other. Every path
 * here is also listed in INDEXABLE_PATHS so it lands in the sitemap.
 */
export const GUIDES = [
  {
    path: "/mods",
    label: "Deadlock mods",
    description: "Browse GameBanana mods and install them in one click.",
  },
  {
    path: "/skins",
    label: "Deadlock skins",
    description: "Pick a hero skin, preview it and swap back any time.",
  },
  {
    path: "/how-to-install-deadlock-mods",
    label: "How to install Deadlock mods",
    description: "Set up mods in a few minutes, with or without the app.",
  },
  {
    path: "/deadlock-mods-not-working",
    label: "Mods not working after a patch",
    description: "Fix mods that broke after a Deadlock update.",
  },
  {
    path: "/compare/grimoire",
    label: "Deadlock Mod Manager vs Grimoire",
    description: "How the two open-source mod managers compare.",
  },
] as const;

/**
 * One page per error message users search for word for word. Linked from
 * /deadlock-mods-not-working and from each other, not from the footer.
 */
export const ERROR_GUIDES = [
  {
    path: "/deadlock-mod-manager-os-error-5",
    label: "Access is denied (os error 5)",
    description: "Read-only files or mods installed as admin block changes.",
  },
  {
    path: "/deadlock-mod-manager-os-error-740",
    label: "Requires elevation (os error 740)",
    description: "Steam is set to run as administrator.",
  },
  {
    path: "/deadlock-mod-manager-failed-to-save-mod-order",
    label: "Failed to save mod order",
    description: "The game or another app is holding mod files open.",
  },
  {
    path: "/deadlock-mod-manager-failed-to-download",
    label: "Failed to download / slow downloads",
    description: "GameBanana limits, antivirus and network problems.",
  },
  {
    path: "/deadlock-fatal-error-unable-to-load-layout-file",
    label: "Deadlock Fatal Error on launch",
    description: "Unable to load layout file, unable to find child and more.",
  },
] as const;

export type Guide = (typeof GUIDES)[number] | (typeof ERROR_GUIDES)[number];

export type GuidePath = Guide["path"];

/** Related links for error pages: the other errors plus the general fixes. */
export const TROUBLESHOOTING_GUIDES: readonly Guide[] = [
  GUIDES[3],
  ...ERROR_GUIDES,
];
