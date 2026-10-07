import type { CSSProperties } from "react";

export type PreviewThemeId =
  | "default"
  | "bloodmoon"
  | "nightshift"
  | "lovelock"
  | "tea";

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
