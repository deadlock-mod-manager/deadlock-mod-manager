import type { FeatureFlag } from "@deadlock-mods/shared";
import type { ThemeSettings } from "@/plugins/themes/custom/types";

export const SEASONAL_THEME_IDS = [
  "seasonal-halloween",
  "seasonal-christmas",
  "seasonal-new-year",
  "seasonal-lunar-new-year",
  "seasonal-easter",
] as const;

export type SeasonalThemeId = (typeof SEASONAL_THEME_IDS)[number];

export function isSeasonalThemeId(
  value: string | undefined,
): value is SeasonalThemeId {
  return SEASONAL_THEME_IDS.some((id) => id === value);
}

/** Local calendar dates; `end` is the last day the theme is shown. */
export type SeasonalWindow = {
  themeId: SeasonalThemeId;
  start: Date;
  peak: Date;
  end: Date;
};

export type ActiveSeason = {
  themeId: SeasonalThemeId;
  /** Identifies one occurrence so a user can turn it off until next year. */
  key: string;
  forced: boolean;
  end?: Date;
};

export type SeasonalControls = {
  enabled: boolean;
  schedule: boolean;
  forced?: SeasonalThemeId;
  disabled: SeasonalThemeId[];
};

const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date);

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86_400_000);

/** Whole days from today to `target`; negative once it has passed. */
export const daysUntil = (target: Date, now = new Date()) =>
  daysBetween(target, startOfDay(now));

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return day(year, month, date);
}

/** Lunar New Year depends on astronomical new moons; outside this table the theme stays off. */
const LUNAR_NEW_YEAR = new Map<number, [month: number, date: number]>([
  [2025, [1, 29]],
  [2026, [2, 17]],
  [2027, [2, 6]],
  [2028, [1, 26]],
  [2029, [2, 13]],
  [2030, [2, 3]],
  [2031, [1, 23]],
  [2032, [2, 11]],
  [2033, [1, 31]],
  [2034, [2, 19]],
  [2035, [2, 8]],
  [2036, [1, 28]],
  [2037, [2, 15]],
  [2038, [2, 4]],
  [2039, [1, 24]],
  [2040, [2, 12]],
]);

export function lunarNewYear(year: number) {
  const entry = LUNAR_NEW_YEAR.get(year);
  return entry ? day(year, entry[0], entry[1]) : undefined;
}

const ZODIAC = [
  "rat",
  "ox",
  "tiger",
  "rabbit",
  "dragon",
  "snake",
  "horse",
  "goat",
  "monkey",
  "rooster",
  "dog",
  "pig",
] as const;

export type ZodiacAnimal = (typeof ZODIAC)[number];

export function zodiacAnimal(year: number): ZodiacAnimal {
  return ZODIAC[(((year - 2020) % 12) + 12) % 12];
}

/** Windows open about a month ahead where the calendar allows it; New Year and Lunar New Year are shorter to avoid colliding with Christmas. */
function windowsForYear(year: number): SeasonalWindow[] {
  const windows: SeasonalWindow[] = [
    {
      themeId: "seasonal-halloween",
      start: day(year, 10, 1),
      peak: day(year, 10, 31),
      end: day(year, 11, 1),
    },
    {
      themeId: "seasonal-christmas",
      start: day(year, 12, 1),
      peak: day(year, 12, 25),
      end: day(year, 12, 26),
    },
    {
      themeId: "seasonal-new-year",
      start: day(year, 12, 27),
      peak: day(year, 12, 31),
      end: day(year + 1, 1, 1),
    },
  ];

  const lny = lunarNewYear(year);
  if (lny) {
    windows.push({
      themeId: "seasonal-lunar-new-year",
      start: addDays(lny, -21),
      peak: lny,
      end: addDays(lny, 14),
    });
  }

  const easter = easterSunday(year);
  windows.push({
    themeId: "seasonal-easter",
    start: addDays(easter, -30),
    peak: easter,
    end: addDays(easter, 1),
  });

  return windows;
}

const windowKey = (window: SeasonalWindow) =>
  `${window.themeId}:${window.peak.getFullYear()}`;

/** The window containing `now`; when two overlap, the one whose festival is closer wins. */
function findSeasonalWindow(
  now: Date,
  allowed: (id: SeasonalThemeId) => boolean = () => true,
): SeasonalWindow | undefined {
  const today = startOfDay(now);
  const year = today.getFullYear();
  let best: SeasonalWindow | undefined;

  for (const window of [year - 1, year, year + 1].flatMap(windowsForYear)) {
    if (!allowed(window.themeId)) continue;
    if (today < window.start || today > window.end) continue;
    if (
      !best ||
      Math.abs(daysBetween(today, window.peak)) <
        Math.abs(daysBetween(today, best.peak))
    ) {
      best = window;
    }
  }

  return best;
}

export function nextSeasonalWindow(
  now: Date,
  allowed: (id: SeasonalThemeId) => boolean = () => true,
): SeasonalWindow | undefined {
  const today = startOfDay(now);
  const year = today.getFullYear();
  return [year, year + 1]
    .flatMap(windowsForYear)
    .filter((window) => allowed(window.themeId) && window.start > today)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
}

const flagName = (id: SeasonalThemeId) =>
  `seasonal-theme-${id.slice("seasonal-".length)}`;

/** Fails closed: nothing seasonal happens until the server sends `seasonal-themes: true`. */
export function readSeasonalControls(
  flags: readonly FeatureFlag[] = [],
): SeasonalControls {
  const flag = (name: string) => flags.find((f) => f.name === name)?.value;
  const forcedValue = flag("seasonal-theme-force");
  const forced = SEASONAL_THEME_IDS.find(
    (id) => forcedValue === id || forcedValue === id.slice("seasonal-".length),
  );

  return {
    enabled:
      flag("seasonal-themes") === true && flag("plugin-themes") !== false,
    schedule: flag("seasonal-themes-schedule") !== false,
    forced,
    disabled: SEASONAL_THEME_IDS.filter((id) => flag(flagName(id)) === false),
  };
}

export function resolveSeason(
  controls: SeasonalControls,
  now: Date,
): ActiveSeason | undefined {
  if (!controls.enabled) return undefined;
  const allowed = (id: SeasonalThemeId) => !controls.disabled.includes(id);

  if (controls.forced && allowed(controls.forced)) {
    return {
      themeId: controls.forced,
      key: `${controls.forced}:forced`,
      forced: true,
    };
  }
  if (!controls.schedule) return undefined;

  const window = findSeasonalWindow(now, allowed);
  return window
    ? {
        themeId: window.themeId,
        key: windowKey(window),
        forced: false,
        end: window.end,
      }
    : undefined;
}

/** Seasonal themes only fill in for players who have not picked a theme, like the Remlock release default. */
export function resolveSeasonalTheme(
  settings: ThemeSettings | undefined,
  season: ActiveSeason | undefined,
  backgroundEnabled = false,
): SeasonalThemeId | undefined {
  if (!season || backgroundEnabled) return undefined;
  if (settings?.activeTheme) return undefined;
  if (settings?.seasonalThemes === false) return undefined;
  if (settings?.seasonalDismissed === season.key) return undefined;
  return season.themeId;
}
