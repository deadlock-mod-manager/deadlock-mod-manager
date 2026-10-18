import { describe, expect, it } from "bun:test";
import type { LocalMod } from "@/types/mods";
import { LibrarySortType, sortLibraryMods } from "./library-display";

const mod = (values: Partial<LocalMod>): LocalMod =>
  ({
    remoteId: values.name ?? "1",
    name: "Test Mod",
    ...values,
  }) as LocalMod;

const names = (mods: LocalMod[]) => mods.map((m) => m.name);

describe("sortLibraryMods", () => {
  it("orders by hero alphabetically, ties by name, unknown heroes last", () => {
    const mods = [
      mod({ name: "zeta", hero: "Bebop" }),
      mod({ name: "no hero" }),
      mod({ name: "beta", hero: "Abrams" }),
      mod({ name: "alpha", hero: "Bebop" }),
    ];

    expect(names(sortLibraryMods(mods, LibrarySortType.Hero))).toEqual([
      "beta",
      "alpha",
      "zeta",
      "no hero",
    ]);
  });

  it("uses a manual hero override over the API hero", () => {
    const mods = [
      mod({ name: "first", hero: "Abrams", heroOverride: "Yamato" }),
      mod({ name: "second", hero: "Bebop" }),
    ];

    expect(names(sortLibraryMods(mods, LibrarySortType.Hero))).toEqual([
      "second",
      "first",
    ]);
  });

  it("orders by name case-insensitively", () => {
    const mods = [mod({ name: "bravo" }), mod({ name: "Alpha" })];

    expect(names(sortLibraryMods(mods, LibrarySortType.Name))).toEqual([
      "Alpha",
      "bravo",
    ]);
  });

  it("puts the newest download first for recently added", () => {
    const mods = [
      mod({ name: "old", downloadedAt: new Date("2026-01-01") }),
      mod({ name: "new", downloadedAt: new Date("2026-06-01") }),
    ];

    expect(names(sortLibraryMods(mods, LibrarySortType.RecentlyAdded))).toEqual(
      ["new", "old"],
    );
  });

  it("orders by install order, then download date, without mutating input", () => {
    const mods = [
      mod({ name: "unordered", downloadedAt: new Date("2026-01-01") }),
      mod({ name: "second", installOrder: 2 }),
      mod({ name: "first", installOrder: 1 }),
    ];

    expect(names(sortLibraryMods(mods, LibrarySortType.InstallOrder))).toEqual([
      "first",
      "second",
      "unordered",
    ]);
    expect(names(mods)).toEqual(["unordered", "second", "first"]);
  });
});
