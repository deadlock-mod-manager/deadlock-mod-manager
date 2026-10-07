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

export type GuidePath = (typeof GUIDES)[number]["path"];
