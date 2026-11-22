import type { SeasonalThemeId } from "@/lib/seasonal-themes";
import { usePersistedStore } from "@/lib/store";
import { selectThemeSettings } from "@/lib/store/selectors";
import type { ThemeSettings } from "../../custom/types";

const NONE: readonly never[] = [];

const patchThemeSettings = (
  patch: (current: ThemeSettings) => Partial<ThemeSettings>,
) => {
  const state = usePersistedStore.getState();
  const current = selectThemeSettings(state) ?? {
    activeSection: "pre-defined",
  };
  state.setPluginSettings("themes", { ...current, ...patch(current) });
};

/** New Year's window crosses into January, so its progress stays on the year it started. */
const seasonYear = (themeId: SeasonalThemeId, now = new Date()) =>
  themeId === "seasonal-new-year" && now.getMonth() === 0
    ? now.getFullYear() - 1
    : now.getFullYear();

const findsKey = (themeId: SeasonalThemeId) =>
  `${themeId}:${seasonYear(themeId)}`;

export const useFinds = (themeId: SeasonalThemeId): readonly string[] =>
  usePersistedStore(
    (state) =>
      selectThemeSettings(state)?.seasonalFinds?.[findsKey(themeId)] ?? NONE,
  );

export const recordFind = (themeId: SeasonalThemeId, id: string) =>
  patchThemeSettings((current) => {
    const key = findsKey(themeId);
    const found = current.seasonalFinds?.[key] ?? [];
    return found.includes(id)
      ? {}
      : { seasonalFinds: { ...current.seasonalFinds, [key]: [...found, id] } };
  });

export const useAdventDoors = (year: number): readonly number[] =>
  usePersistedStore(
    (state) => selectThemeSettings(state)?.adventDoors?.[year] ?? NONE,
  );

export const openAdventDoor = (year: number, door: number) =>
  patchThemeSettings((current) => {
    const opened = current.adventDoors?.[year] ?? [];
    return opened.includes(door)
      ? {}
      : { adventDoors: { ...current.adventDoors, [year]: [...opened, door] } };
  });

export const useLuckyCoins = (year: number) =>
  usePersistedStore(
    (state) => selectThemeSettings(state)?.luckyCoins?.[year] ?? 0,
  );

export const addLuckyCoins = (year: number, amount: number) =>
  patchThemeSettings((current) => ({
    luckyCoins: {
      ...current.luckyCoins,
      [year]: (current.luckyCoins?.[year] ?? 0) + amount,
    },
  }));
