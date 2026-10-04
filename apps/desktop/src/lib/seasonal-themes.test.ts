import { describe, expect, it } from "bun:test";
import type { FeatureFlag } from "@deadlock-mods/shared";
import {
  easterSunday,
  nextSeasonalWindow,
  readSeasonalControls,
  resolveSeason,
  resolveSeasonalTheme,
  type SeasonalControls,
  zodiacAnimal,
} from "./seasonal-themes";

const flag = (name: string, value: boolean | string): FeatureFlag => ({
  id: name,
  name,
  description: null,
  type: value === true || value === false ? "boolean" : "string",
  value,
  enabled: value,
  exposed: true,
});

const on: SeasonalControls = { enabled: true, schedule: true, disabled: [] };
const at = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const themeOn = (iso: string, controls = on) =>
  resolveSeason(controls, at(iso))?.themeId;

describe("seasonal calendar", () => {
  it("computes Gregorian Easter", () => {
    expect(easterSunday(2026).toDateString()).toBe(
      new Date(2026, 3, 5).toDateString(),
    );
    expect(easterSunday(2027).toDateString()).toBe(
      new Date(2027, 2, 28).toDateString(),
    );
    expect(easterSunday(2038).toDateString()).toBe(
      new Date(2038, 3, 25).toDateString(),
    );
  });

  it("opens each festival's window on the expected days", () => {
    expect(themeOn("2026-09-30")).toBeUndefined();
    expect(themeOn("2026-10-01")).toBe("seasonal-halloween");
    expect(themeOn("2026-11-01")).toBe("seasonal-halloween");
    expect(themeOn("2026-11-02")).toBeUndefined();
    expect(themeOn("2026-12-01")).toBe("seasonal-christmas");
    expect(themeOn("2026-12-26")).toBe("seasonal-christmas");
    expect(themeOn("2026-12-27")).toBe("seasonal-new-year");
    expect(themeOn("2027-01-01")).toBe("seasonal-new-year");
    expect(themeOn("2027-01-02")).toBeUndefined();
    // Lunar New Year 2027 is Feb 6: Jan 16 through Feb 20.
    expect(themeOn("2027-01-15")).toBeUndefined();
    expect(themeOn("2027-01-16")).toBe("seasonal-lunar-new-year");
    expect(themeOn("2027-02-20")).toBe("seasonal-lunar-new-year");
    // Easter 2027 is Mar 28: Feb 26 through Mar 29.
    expect(themeOn("2027-02-26")).toBe("seasonal-easter");
    expect(themeOn("2027-03-29")).toBe("seasonal-easter");
    expect(themeOn("2027-03-30")).toBeUndefined();
  });

  it("skips disabled themes and finds the next one", () => {
    const controls = { ...on, disabled: ["seasonal-halloween" as const] };
    expect(themeOn("2026-10-15", controls)).toBeUndefined();
    expect(
      nextSeasonalWindow(
        at("2026-10-15"),
        (id) => !controls.disabled.includes(id),
      )?.themeId,
    ).toBe("seasonal-christmas");
  });

  it("names the zodiac animal", () => {
    expect(zodiacAnimal(2026)).toBe("horse");
    expect(zodiacAnimal(2027)).toBe("goat");
    expect(zodiacAnimal(2019)).toBe("pig");
  });
});

describe("seasonal flags", () => {
  it("fails closed without the master switch", () => {
    expect(readSeasonalControls().enabled).toBe(false);
    expect(themeOn("2026-12-24", readSeasonalControls())).toBeUndefined();
  });

  it("respects the themes plugin kill switch", () => {
    const controls = readSeasonalControls([
      flag("seasonal-themes", true),
      flag("plugin-themes", false),
    ]);
    expect(controls.enabled).toBe(false);
  });

  it("reads schedule, per-theme switches and the force flag", () => {
    const controls = readSeasonalControls([
      flag("seasonal-themes", true),
      flag("seasonal-themes-schedule", false),
      flag("seasonal-theme-christmas", false),
      flag("seasonal-theme-force", "easter"),
    ]);
    expect(controls).toEqual({
      enabled: true,
      schedule: false,
      forced: "seasonal-easter",
      disabled: ["seasonal-christmas"],
    });
  });

  it("forces a theme off-season and ignores unknown or disabled ones", () => {
    const forced = {
      ...on,
      schedule: false,
      forced: "seasonal-easter" as const,
    };
    expect(resolveSeason(forced, at("2026-07-01"))).toEqual({
      themeId: "seasonal-easter",
      key: "seasonal-easter:forced",
      forced: true,
    });
    expect(
      themeOn("2026-07-01", { ...forced, disabled: ["seasonal-easter"] }),
    ).toBeUndefined();
    expect(
      readSeasonalControls([
        flag("seasonal-themes", true),
        flag("seasonal-theme-force", "valentines"),
      ]).forced,
    ).toBeUndefined();
  });

  it("stops automatic switching when the schedule is off", () => {
    expect(themeOn("2026-12-24", { ...on, schedule: false })).toBeUndefined();
  });
});

describe("seasonal theme for a player", () => {
  const season = resolveSeason(on, at("2026-12-24"));

  it("dresses up players without a theme", () => {
    expect(resolveSeasonalTheme(undefined, season)).toBe("seasonal-christmas");
    expect(resolveSeasonalTheme({ activeSection: "pre-defined" }, season)).toBe(
      "seasonal-christmas",
    );
  });

  it("never overrides a chosen theme or the background plugin", () => {
    expect(
      resolveSeasonalTheme(
        { activeSection: "pre-defined", activeTheme: "oled" },
        season,
      ),
    ).toBeUndefined();
    expect(resolveSeasonalTheme(undefined, season, true)).toBeUndefined();
  });

  it("honours the opt-out and the per-occurrence dismissal", () => {
    expect(
      resolveSeasonalTheme(
        { activeSection: "pre-defined", seasonalThemes: false },
        season,
      ),
    ).toBeUndefined();
    expect(
      resolveSeasonalTheme(
        {
          activeSection: "pre-defined",
          seasonalDismissed: "seasonal-christmas:2026",
        },
        season,
      ),
    ).toBeUndefined();
    // A dismissal from last year does not carry over.
    expect(
      resolveSeasonalTheme(
        {
          activeSection: "pre-defined",
          seasonalDismissed: "seasonal-christmas:2025",
        },
        season,
      ),
    ).toBe("seasonal-christmas");
  });
});
