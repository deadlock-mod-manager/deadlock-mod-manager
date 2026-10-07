/**
 * A snapshot of real, popular mods from the Mods Store (taken October 2026),
 * used by the landing page's app preview. Thumbnails live in /home/mods.
 */
export type PreviewMod = {
  id: string;
  name: string;
  author: string;
  category: "Skins" | "Quality of Life";
  hero: string | null;
  downloads: number;
  likes: number;
  updatedAt: string;
};

export const PREVIEW_MODS: PreviewMod[] = [
  {
    id: "623518",
    name: "[UPDATED] Top Bar Plus",
    author: "bonclide",
    category: "Quality of Life",
    hero: null,
    downloads: 618030,
    likes: 127,
    updatedAt: "2026-10-02",
  },
  {
    id: "601444",
    name: "Always Show Passive Items and Actives Icons",
    author: "Hanturaya",
    category: "Quality of Life",
    hero: null,
    downloads: 964264,
    likes: 70,
    updatedAt: "2026-10-03",
  },
  {
    id: "650634",
    name: "QOL Lock [INSTANT SAVE/LOAD UPDATE]",
    author: "civo",
    category: "Quality of Life",
    hero: null,
    downloads: 7805239,
    likes: 270,
    updatedAt: "2026-10-05",
  },
  {
    id: "691863",
    name: "Yamato remodel",
    author: "thiagolima13D",
    category: "Skins",
    hero: "Yamato",
    downloads: 240362,
    likes: 255,
    updatedAt: "2026-09-30",
  },
  {
    id: "636266",
    name: "Jacket (Billy Overhaul)",
    author: "amperesevere",
    category: "Skins",
    hero: "Billy",
    downloads: 761607,
    likes: 125,
    updatedAt: "2026-08-23",
  },
  {
    id: "656006",
    name: "Holliday Remodel",
    author: "Kirill Senzu",
    category: "Skins",
    hero: "Holliday",
    downloads: 237833,
    likes: 343,
    updatedAt: "2026-02-26",
  },
  {
    id: "637275",
    name: "Numeric Health v2 | Now with Single Bar options",
    author: "ninjabladeJr",
    category: "Quality of Life",
    hero: null,
    downloads: 430275,
    likes: 44,
    updatedAt: "2026-09-29",
  },
  {
    id: "655209",
    name: "Faun Celeste (QUALITY UPDATE)",
    author: "basilisken",
    category: "Skins",
    hero: "Celeste",
    downloads: 207027,
    likes: 205,
    updatedAt: "2026-07-03",
  },
  {
    id: "623055",
    name: "glorpyViscous",
    author: "sodaspheal",
    category: "Skins",
    hero: "Viscous",
    downloads: 204199,
    likes: 233,
    updatedAt: "2026-04-04",
  },
  {
    id: "628313",
    name: "Toon Ivy (SOUL ORB FIX)",
    author: "basilisken",
    category: "Skins",
    hero: "Ivy",
    downloads: 177532,
    likes: 340,
    updatedAt: "2026-07-01",
  },
  {
    id: "661996",
    name: "Formal Wraith",
    author: "ticoslay",
    category: "Skins",
    hero: "Wraith",
    downloads: 175697,
    likes: 159,
    updatedAt: "2026-10-02",
  },
  {
    id: "669234",
    name: "Shiv Refresh (CITY NEVER SLEEPS)",
    author: "PloobisMDL",
    category: "Skins",
    hero: "Shiv",
    downloads: 185160,
    likes: 198,
    updatedAt: "2026-10-05",
  },
  {
    id: "599927",
    name: "Yamato redesign (NEW ICONS and COLORS!)",
    author: "Kirill Senzu",
    category: "Skins",
    hero: "Yamato",
    downloads: 671999,
    likes: 524,
    updatedAt: "2026-02-16",
  },
  {
    id: "656796",
    name: "Vyper Propeller Hat",
    author: "chipmajor",
    category: "Skins",
    hero: "Vyper",
    downloads: 219249,
    likes: 61,
    updatedAt: "2026-09-10",
  },
  {
    id: "678180",
    name: "dacooderr's QoL Lite (CNS Ready!)",
    author: "dacooderr",
    category: "Quality of Life",
    hero: null,
    downloads: 184266,
    likes: 36,
    updatedAt: "2026-10-03",
  },
  {
    id: "631695",
    name: "Lashlyn Lash Skin",
    author: "Ahzealion",
    category: "Skins",
    hero: "Lash",
    downloads: 175019,
    likes: 263,
    updatedAt: "2026-07-19",
  },
];

/** preview.json keys for the store categories (categories.<key>). */
export const CATEGORY_KEYS = {
  Skins: "skins",
  "Quality of Life": "qualityOfLife",
} as const satisfies Record<PreviewMod["category"], string>;

export const modThumbnail = (mod: PreviewMod) => `/home/mods/${mod.id}.webp`;

export const modUrl = (mod: PreviewMod) =>
  `https://gamebanana.com/mods/${mod.id}`;

export const modById = (id: string) =>
  PREVIEW_MODS.find((mod) => mod.id === id);

export const heroIcon = (hero: string) =>
  `/home/heroes/${hero.toLowerCase().replace(/\s+/g, "-")}.webp`;
