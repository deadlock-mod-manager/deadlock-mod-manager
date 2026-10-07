import type { CSSProperties } from "react";

export type PreviewThemeId =
  | "default"
  | "bloodmoon"
  | "nightshift"
  | "lovelock"
  | "tea"
  | "arcane"
  | "deadlock-api"
  | "oled";

export type PreviewTheme = {
  id: PreviewThemeId;
  /**
   * English name, for pages that aren't translated yet. Translated names and
   * descriptions live in the preview namespace (themes.<id>).
   */
  name: string;
  preview: string;
  icon?: string;
  /** HSL triplets, same tokens and values as the desktop app's themes. */
  vars: Record<string, string>;
  backdrop?: CSSProperties;
  /** Themes with a backdrop let it show through the sidebar and titlebar. */
  transparentChrome?: boolean;
  hideGeometry?: boolean;
};

// Desktop defaults differ from the website's in a few places (card, sidebar).
const BASE_VARS = {
  "--background": "20 9% 6%",
  "--foreground": "38 65% 97%",
  "--card": "20 8% 9%",
  "--card-foreground": "38 65% 97%",
  "--popover": "20 9% 6%",
  "--primary": "42 60% 84%",
  "--primary-foreground": "20 9% 6%",
  "--secondary": "15 10% 16%",
  "--secondary-foreground": "41.6 60% 63%",
  "--muted": "0 0% 14.9%",
  "--muted-foreground": "0 0% 63.9%",
  "--accent": "0 0% 14.9%",
  "--accent-foreground": "38 65% 97%",
  "--border": "0 0% 14.9%",
  "--input": "0 0% 14.9%",
  "--ring": "15 10% 16%",
  "--sidebar-background": "20 9% 6%",
  "--sidebar-foreground": "38 65% 97%",
  "--sidebar-primary": "42 60% 84%",
  "--sidebar-accent": "42 60% 84%",
  "--sidebar-accent-foreground": "15 10% 16%",
  "--sidebar-border": "240 3.7% 15.9%",
} satisfies Record<string, string>;

const imageBackdrop = (url: string, dim: number): CSSProperties => ({
  backgroundImage: `linear-gradient(hsl(var(--background) / ${dim}), hsl(var(--background) / ${dim})), url(${url})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
});

export const PREVIEW_THEMES: PreviewTheme[] = [
  {
    id: "default",
    name: "Default",
    preview: "/home/app/theme-default.webp",
    vars: BASE_VARS,
  },
  {
    id: "bloodmoon",
    name: "Bloodmoon",
    preview: "/home/app/theme-bloodmoon.webp",
    icon: "/home/themes/bloodmoon-icon.webp",
    vars: {
      ...BASE_VARS,
      "--border": "0 84% 60%",
      "--sidebar-border": "0 84% 60%",
    },
    backdrop: imageBackdrop("/home/themes/bloodmoon-bg.webp", 0.6),
    transparentChrome: true,
    hideGeometry: true,
  },
  {
    id: "nightshift",
    name: "Nightshift",
    preview: "/home/app/theme-nightshift.webp",
    icon: "/home/themes/nightshift-icon.webp",
    vars: {
      ...BASE_VARS,
      "--border": "42 40% 45%",
      "--sidebar-border": "42 40% 45%",
    },
    backdrop: imageBackdrop("/home/themes/nightshift-bg.webp", 0.7),
    transparentChrome: true,
    hideGeometry: true,
  },
  {
    id: "lovelock",
    name: "Lovelock",
    preview: "/home/app/theme-lovelock.webp",
    icon: "/home/themes/lovelock-icon.webp",
    vars: {
      ...BASE_VARS,
      "--background": "300 19% 11%",
      "--foreground": "330 40% 95%",
      "--card": "296 17% 16% / 0.92",
      "--card-foreground": "330 40% 95%",
      "--popover": "296 18% 15%",
      "--secondary": "296 15% 21%",
      "--secondary-foreground": "330 35% 92%",
      "--muted": "296 14% 20%",
      "--muted-foreground": "320 15% 70%",
      "--primary": "333 100% 77%",
      "--primary-foreground": "300 25% 12%",
      "--accent": "318 31% 30%",
      "--accent-foreground": "330 40% 95%",
      "--border": "300 14% 25%",
      "--input": "300 14% 24%",
      "--ring": "333 100% 77%",
      "--sidebar-background": "300 19% 10% / 0.7",
      "--sidebar-foreground": "330 40% 95%",
      "--sidebar-primary": "333 100% 77%",
      "--sidebar-accent": "318 31% 30%",
      "--sidebar-accent-foreground": "330 40% 95%",
      "--sidebar-border": "300 14% 22%",
    },
    backdrop: {
      backgroundColor: "#211722",
      backgroundImage:
        "radial-gradient(ellipse 70% 55% at 0% 0%, rgba(255,140,192,.12) 0%, transparent 55%), radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255,140,192,.09) 0%, transparent 50%), radial-gradient(circle, rgba(255,196,224,.09) 1px, transparent 1.5px)",
      backgroundSize: "100% 100%, 100% 100%, 22px 22px",
    },
  },
  {
    id: "tea",
    name: "Tea",
    preview: "/home/app/theme-tea.webp",
    icon: "/home/themes/tea-icon.webp",
    vars: {
      ...BASE_VARS,
      "--background": "282 45% 12% / 0.72",
      "--foreground": "42 65% 94%",
      "--card": "282 45% 14% / 0.8",
      "--card-foreground": "42 65% 94%",
      "--popover": "282 45% 14% / 0.8",
      "--secondary": "282 35% 22% / 0.75",
      "--secondary-foreground": "42 65% 90%",
      "--muted": "282 30% 20% / 0.75",
      "--muted-foreground": "42 35% 70%",
      "--accent": "42 58% 78%",
      "--accent-foreground": "20 9% 6%",
      "--border": "42 62% 46%",
      "--input": "42 58% 46% / 0.45",
      "--ring": "42 55% 60%",
      "--primary": "42 58% 78%",
      "--sidebar-background": "282 52% 12% / 0.88",
      "--sidebar-foreground": "42 65% 94%",
      "--sidebar-accent": "42 58% 78%",
      "--sidebar-accent-foreground": "20 9% 6%",
      "--sidebar-border": "42 62% 44%",
      "--sidebar-primary": "42 58% 78%",
    },
    backdrop: {
      backgroundColor: "#1a1222",
      backgroundImage:
        "linear-gradient(rgba(26,18,34,.35), rgba(26,18,34,.6)), url(/home/themes/tea-pattern.webp)",
      backgroundSize: "auto, 960px auto",
    },
    transparentChrome: true,
  },
  {
    id: "arcane",
    name: "Arcane",
    preview: "/home/app/theme-arcane.webp",
    // The desktop derives these from the accent picker; values are for the
    // default accent (#E8416F).
    vars: {
      ...BASE_VARS,
      "--background": "0 0% 4%",
      "--foreground": "0 0% 90%",
      "--card": "343 15% 6% / 0.9",
      "--card-foreground": "0 0% 90%",
      "--popover": "343 15% 6% / 0.95",
      "--secondary": "343 30% 10% / 0.85",
      "--secondary-foreground": "0 0% 85%",
      "--muted": "343 30% 12% / 0.85",
      "--muted-foreground": "0 0% 60%",
      "--primary": "343 70% 48%",
      "--primary-foreground": "0 0% 4%",
      "--accent": "343 50% 38%",
      "--accent-foreground": "0 0% 4%",
      "--border": "343 30% 16%",
      "--input": "343 30% 14% / 0.7",
      "--ring": "343 65% 45%",
      "--sidebar-background": "0 0% 4% / 0.98",
      "--sidebar-foreground": "0 0% 90%",
      "--sidebar-primary": "343 70% 48%",
      "--sidebar-accent": "343 50% 38%",
      "--sidebar-accent-foreground": "0 0% 4%",
      "--sidebar-border": "343 30% 14%",
    },
    backdrop: {
      background:
        "radial-gradient(ellipse 85% 65% at 0% 0%, rgba(232,65,111,.26) 0%, transparent 52%), radial-gradient(ellipse 80% 60% at 100% 100%, rgba(232,65,111,.21) 0%, transparent 48%), radial-gradient(ellipse 55% 45% at 100% 0%, rgba(197,55,94,.11) 0%, transparent 42%), radial-gradient(ellipse 65% 50% at 0% 100%, rgba(197,55,94,.09) 0%, transparent 38%), radial-gradient(ellipse 50% 50% at 50% 50%, rgba(232,65,111,.04) 0%, transparent 65%), hsl(var(--background))",
    },
    transparentChrome: true,
  },
  {
    id: "deadlock-api",
    name: "Deadlock API",
    preview: "/home/app/theme-deadlock-api.webp",
    icon: "/home/themes/deadlock-api-icon.svg",
    vars: {
      ...BASE_VARS,
      "--background": "220 20% 2%",
      "--foreground": "210 20% 92%",
      "--card": "220 20% 5% / 0.9",
      "--card-foreground": "210 20% 92%",
      "--popover": "220 20% 5% / 0.95",
      "--secondary": "220 15% 9% / 0.85",
      "--secondary-foreground": "210 15% 85%",
      "--muted": "220 15% 11% / 0.85",
      "--muted-foreground": "210 10% 55%",
      "--primary": "354 94% 62%",
      "--primary-foreground": "0 0% 100%",
      "--accent": "354 80% 50%",
      "--accent-foreground": "0 0% 100%",
      "--border": "220 15% 13%",
      "--input": "220 15% 11% / 0.7",
      "--ring": "354 90% 58%",
      "--sidebar-background": "220 20% 2% / 0.98",
      "--sidebar-foreground": "210 20% 92%",
      "--sidebar-primary": "354 94% 62%",
      "--sidebar-accent": "354 80% 50%",
      "--sidebar-accent-foreground": "0 0% 100%",
      "--sidebar-border": "220 15% 11%",
    },
    backdrop: {
      background:
        "radial-gradient(ellipse 85% 65% at 0% 0%, rgba(250,68,84,.18) 0%, transparent 52%), radial-gradient(ellipse 80% 60% at 100% 100%, rgba(250,68,84,.14) 0%, transparent 48%), radial-gradient(ellipse 55% 45% at 100% 0%, rgba(255,107,122,.08) 0%, transparent 42%), radial-gradient(ellipse 65% 50% at 0% 100%, rgba(255,107,122,.06) 0%, transparent 38%), hsl(var(--background))",
    },
    transparentChrome: true,
  },
  {
    id: "oled",
    name: "OLED",
    preview: "/home/app/theme-oled.webp",
    // Desktop default accent (#D8C497).
    vars: {
      ...BASE_VARS,
      "--background": "0 0% 0%",
      "--foreground": "0 0% 88%",
      "--card": "0 0% 4%",
      "--card-foreground": "0 0% 88%",
      "--popover": "0 0% 6%",
      "--primary": "42 45% 72%",
      "--primary-foreground": "0 0% 0%",
      "--secondary": "0 0% 10%",
      "--secondary-foreground": "0 0% 88%",
      "--muted": "0 0% 10%",
      "--muted-foreground": "0 0% 65%",
      "--accent": "0 0% 13%",
      "--accent-foreground": "0 0% 88%",
      "--border": "0 0% 18%",
      "--input": "0 0% 24%",
      "--ring": "42 45% 72%",
      "--sidebar-background": "0 0% 0%",
      "--sidebar-foreground": "0 0% 88%",
      "--sidebar-primary": "42 45% 72%",
      "--sidebar-accent": "0 0% 13%",
      "--sidebar-accent-foreground": "42 45% 72%",
      "--sidebar-border": "0 0% 18%",
    },
    hideGeometry: true,
  },
];

export const getPreviewTheme = (id: PreviewThemeId) =>
  PREVIEW_THEMES.find((theme) => theme.id === id) ?? PREVIEW_THEMES[0];

/**
 * Inline style for the preview root. Tailwind's `--color-*` aliases resolve
 * `hsl(var(--x))` on :root, so they're re-declared here to pick up the
 * theme's values instead of the website's.
 */
export const themeStyle = (theme: PreviewTheme): CSSProperties => ({
  ...theme.vars,
  ...Object.fromEntries(
    Object.keys(theme.vars).map((name) => {
      const token = name.slice(2);
      const alias = token === "sidebar-background" ? "sidebar" : token;
      return [`--color-${alias}`, `hsl(var(${name}))`];
    }),
  ),
});
