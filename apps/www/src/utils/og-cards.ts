/**
 * Link preview cards, keyed by page path. `pnpm og:generate` renders each one
 * to `public/og/<slug>.png`; pages without a card share `/og-image.png`.
 * Cards are English-only, so translated pages reuse the English image.
 */
export interface OgCard {
  slug: string;
  eyebrow: string;
  title: string;
  tagline: string;
}

export const OG_CARDS = {
  "/v2": {
    slug: "v2",
    eyebrow: "What's new",
    title: "Deadlock Mod Manager V2",
    tagline:
      "Mods that survive game updates, a GameBanana catalog on your PC, conflict detection, stats and new themes.",
  },
  "/changelog": {
    slug: "changelog",
    eyebrow: "Desktop app",
    title: "Changelog",
    tagline: "New features, improvements and fixes in each release.",
  },
  "/download": {
    slug: "download",
    eyebrow: "Windows & Linux",
    title: "Download",
    tagline:
      "A Windows installer, or Flatpak, .deb and .rpm packages for Linux. Free and open source.",
  },
  "/mods": {
    slug: "mods",
    eyebrow: "GameBanana",
    title: "Deadlock mods",
    tagline:
      "Browse hero skins, HUD and quality-of-life mods and install them in one click.",
  },
  "/skins": {
    slug: "skins",
    eyebrow: "GameBanana",
    title: "Deadlock hero skins",
    tagline:
      "Install skins from GameBanana, preview them in 3D and switch back any time.",
  },
  "/how-to-install-deadlock-mods": {
    slug: "how-to-install-deadlock-mods",
    eyebrow: "Guide",
    title: "How to install Deadlock mods",
    tagline:
      "In one click with Deadlock Mod Manager, or by hand with the addons folder and gameinfo.gi.",
  },
  "/deadlock-mods-not-working": {
    slug: "deadlock-mods-not-working",
    eyebrow: "Troubleshooting",
    title: "Mods not working after an update",
    tagline:
      "Fix gameinfo.gi resets, outdated HUD mods and conflicts step by step.",
  },
  "/compare/grimoire": {
    slug: "compare-grimoire",
    eyebrow: "Comparison",
    title: "Deadlock Mod Manager vs Grimoire",
    tagline:
      "Both cover the same features since V2. You can import your Grimoire setup.",
  },
  "/deadlock-mod-manager-os-error-5": {
    slug: "os-error-5",
    eyebrow: "Fix",
    title: "Access is denied (os error 5)",
    tagline: "When Windows blocks changes to gameinfo.gi or the addons folder.",
  },
  "/deadlock-mod-manager-os-error-740": {
    slug: "os-error-740",
    eyebrow: "Fix",
    title: "os error 740: requires elevation",
    tagline:
      "Steam is set to run as administrator. Turn it off and launch modded again.",
  },
  "/deadlock-mod-manager-failed-to-save-mod-order": {
    slug: "failed-to-save-mod-order",
    eyebrow: "Fix",
    title: "Failed to save mod order",
    tagline:
      "Release locked .vpk files and fix folder permissions, then save the load order again.",
  },
  "/deadlock-mod-manager-failed-to-download": {
    slug: "failed-to-download",
    eyebrow: "Fix",
    title: "Failed or slow downloads",
    tagline:
      "Run the connection check, wait out GameBanana rate limits, and fix antivirus, VPN and DNS problems.",
  },
  "/deadlock-fatal-error-unable-to-load-layout-file": {
    slug: "fatal-error-layout-file",
    eyebrow: "Fix",
    title: "Fatal Error: unable to load layout file",
    tagline:
      "Fix Deadlock crashes caused by mods, from layout files to gameinfo.gi and KV3 parse errors.",
  },
  "/randomizer": {
    slug: "randomizer",
    eyebrow: "Free tool",
    title: "Deadlock Randomizer",
    tagline:
      "A random hero, a legal item build, an ability order and three bravery rules.",
  },
  "/crosshair-generator": {
    slug: "crosshair-generator",
    eyebrow: "Free tool",
    title: "Crosshair Generator",
    tagline:
      "Design a crosshair over in-game backgrounds, then copy the config or share a link.",
  },
  "/vpk-analyzer": {
    slug: "vpk-analyzer",
    eyebrow: "Free tool",
    title: "VPK Analyzer",
    tagline: "Find out which GameBanana mod a stray .vpk file belongs to.",
  },
  "/kv-parser": {
    slug: "kv-parser",
    eyebrow: "Free tool",
    title: "KeyValues Parser",
    tagline:
      "Browse gameinfo.gi and other VDF files as a tree, right in your browser.",
  },
  "/transparency": {
    slug: "transparency",
    eyebrow: "Open source",
    title: "Transparency",
    tagline:
      "Where the money comes from, where it goes, and live platform statistics.",
  },
} satisfies Record<string, OgCard>;

const CARDS_BY_PATH = new Map<string, OgCard>(Object.entries(OG_CARDS));

export const ogCardFor = (path: string) => CARDS_BY_PATH.get(path);

export const ogCardImagePath = (card: OgCard) => `/og/${card.slug}.png`;
