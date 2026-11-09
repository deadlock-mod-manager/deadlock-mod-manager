import { describe, expect, it } from "bun:test";
import { DeadlockHeroes } from "@deadlock-mods/shared";
import type { CatalogFilterSelection } from "./catalog-categories";
import {
  catalogQueryFilterSelection,
  changeCatalogHeroes,
  heroCategoryForKey,
  normalizeCatalogFilterSelection,
  toggleCatalogFilterCategory,
} from "./catalog-hero-categories";

const skins = { key: "mod:10", name: "Skins" };
const abrams = { key: "mod:11", name: "Abrams" };
const faithful = { key: "mod:12", name: "Faithful/Vanilla+" };
const ivy = { key: "mod:13", name: "Ivy" };
const ivyFaithful = { key: "mod:14", name: "Faithful/Vanilla+" };
const world = { key: "mod:20", name: "Model Replacement" };
const walker = { key: "mod:21", name: "Walker" };
const paths = [
  [skins, abrams, faithful],
  [skins, ivy, ivyFaithful],
  [world, walker],
];
const empty: CatalogFilterSelection = { categories: [], keys: [], heroes: [] };

describe("hero categories share the Heroes filter", () => {
  it("selects a hero and Skins without leaving a duplicate hero category key", () => {
    const selected = toggleCatalogFilterCategory(abrams.key, empty, paths);
    expect(selected).toEqual({
      categories: ["Skins"],
      keys: [],
      heroes: ["Abrams"],
    });
    expect(toggleCatalogFilterCategory(ivy.key, selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [],
      heroes: ["Abrams", "Ivy"],
    });
    expect(toggleCatalogFilterCategory(abrams.key, selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [],
      heroes: [],
    });
  });

  it("retains a deeper skin type and adds its hero without a broad Skins override", () => {
    const selected = toggleCatalogFilterCategory(
      faithful.key,
      { categories: ["Skins"], keys: [], heroes: ["Abrams"] },
      paths,
    );
    expect(selected).toEqual({
      categories: [],
      keys: [faithful.key],
      heroes: ["Abrams"],
    });
    expect(
      toggleCatalogFilterCategory(ivyFaithful.key, selected, paths),
    ).toEqual({
      categories: [],
      keys: [faithful.key, ivyFaithful.key],
      heroes: ["Abrams", "Ivy"],
    });
    expect(toggleCatalogFilterCategory(faithful.key, selected, paths)).toEqual({
      categories: [],
      keys: [],
      heroes: ["Abrams"],
    });
    expect(toggleCatalogFilterCategory(abrams.key, selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [],
      heroes: ["Abrams"],
    });
  });

  it("makes the Heroes picker authoritative without retaining old source-specific types", () => {
    const selected = {
      categories: [],
      keys: [faithful.key, walker.key],
      heroes: ["Abrams"],
    };
    expect(changeCatalogHeroes(["Ivy"], selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [walker.key],
      heroes: ["Ivy"],
    });
    expect(changeCatalogHeroes([], selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [walker.key],
      heroes: [],
    });
    expect(changeCatalogHeroes(["Abrams", "Ivy"], selected, paths)).toEqual({
      categories: ["Skins"],
      keys: [walker.key],
      heroes: ["Abrams", "Ivy"],
    });
  });

  it("preserves one hero's selected type when adding another hero's whole branch", () => {
    const typedAbrams = toggleCatalogFilterCategory(faithful.key, empty, paths);
    const mixed = toggleCatalogFilterCategory(ivy.key, typedAbrams, paths);
    expect(mixed).toEqual({
      categories: [],
      keys: [faithful.key, ivy.key],
      heroes: ["Abrams", "Ivy"],
    });
    expect(normalizeCatalogFilterSelection(mixed, paths)).toEqual(mixed);
    expect(toggleCatalogFilterCategory(ivy.key, mixed, paths)).toEqual(
      typedAbrams,
    );
    expect(catalogQueryFilterSelection(mixed, paths, true)).toEqual({
      categories: [],
      keys: [faithful.key, ivy.key],
      heroes: [],
    });
  });

  it("narrows only one hero when skin types are chosen after selecting multiple heroes", () => {
    const allAbrams = toggleCatalogFilterCategory(abrams.key, empty, paths);
    const bothHeroes = toggleCatalogFilterCategory(ivy.key, allAbrams, paths);
    const narrowed = toggleCatalogFilterCategory(
      ivyFaithful.key,
      bothHeroes,
      paths,
    );
    expect(narrowed).toEqual({
      categories: [],
      keys: [abrams.key, ivyFaithful.key],
      heroes: ["Abrams", "Ivy"],
    });
    expect(toggleCatalogFilterCategory(ivy.key, narrowed, paths)).toEqual(
      bothHeroes,
    );
    expect(toggleCatalogFilterCategory(abrams.key, narrowed, paths)).toEqual({
      categories: [],
      keys: [ivyFaithful.key],
      heroes: ["Ivy"],
    });
  });

  it("removes a hero's final typed branch without broadening the other selected hero", () => {
    const typedAbrams = toggleCatalogFilterCategory(faithful.key, empty, paths);
    const mixed = toggleCatalogFilterCategory(ivy.key, typedAbrams, paths);
    expect(toggleCatalogFilterCategory(faithful.key, mixed, paths)).toEqual({
      categories: ["Skins"],
      keys: [],
      heroes: ["Ivy"],
    });
    const bothTyped = toggleCatalogFilterCategory(
      ivyFaithful.key,
      typedAbrams,
      paths,
    );
    expect(toggleCatalogFilterCategory(faithful.key, bothTyped, paths)).toEqual(
      { categories: [], keys: [ivyFaithful.key], heroes: ["Ivy"] },
    );
  });

  it("normalizes saved hero branches and skin types into one visible hero selection", () => {
    expect(
      normalizeCatalogFilterSelection(
        { categories: [], keys: [abrams.key], heroes: [] },
        paths,
      ),
    ).toEqual({ categories: ["Skins"], keys: [], heroes: ["Abrams"] });
    expect(
      normalizeCatalogFilterSelection(
        { categories: ["Skins"], keys: [faithful.key], heroes: ["Abrams"] },
        paths,
      ),
    ).toEqual({ categories: [], keys: [faithful.key], heroes: ["Abrams"] });
    expect(
      normalizeCatalogFilterSelection(
        { categories: ["HUD"], keys: [faithful.key], heroes: ["Ivy"] },
        paths,
      ),
    ).toEqual({
      categories: ["HUD"],
      keys: [faithful.key],
      heroes: ["Ivy", "Abrams"],
    });
  });

  it("uses exact registered aliases only under Mod or WiP Skins roots", () => {
    const alias = { key: "wip:11", name: "Atlas" };
    const wipSkins = { key: "wip:10", name: "Skins" };
    expect(heroCategoryForKey(alias.key, [[wipSkins, alias]])?.hero).toBe(
      DeadlockHeroes.Abrams,
    );
    expect(heroCategoryForKey(abrams.key, [[world, abrams]])).toBeNull();
    expect(heroCategoryForKey(abrams.key, [[abrams]])).toBeNull();
    expect(
      heroCategoryForKey("sound:11", [
        [
          { key: "sound:10", name: "Skins" },
          { key: "sound:11", name: "Abrams" },
        ],
      ]),
    ).toBeNull();
    expect(
      heroCategoryForKey("mod:99", [
        [skins, { key: "mod:99", name: "New unregistered hero" }],
      ]),
    ).toBeNull();
    expect(
      heroCategoryForKey(faithful.key, [
        [skins, { key: "mod:90", name: "Props" }, abrams, faithful],
      ]),
    ).toBeNull();
    expect(heroCategoryForKey(abrams.key, [[wipSkins, abrams]])).toBeNull();
  });

  it("preserves ordinary and unknown categories without adding a guessed hero", () => {
    expect(toggleCatalogFilterCategory(walker.key, empty, paths)).toEqual({
      categories: [],
      keys: [walker.key],
      heroes: [],
    });
    const unknown = { key: "mod:99", name: "New unregistered hero" };
    expect(
      toggleCatalogFilterCategory(unknown.key, empty, [[skins, unknown]]),
    ).toEqual({ categories: [], keys: [unknown.key], heroes: [] });
  });
});

describe("linked skin exclusions", () => {
  it("excludes the selected hero's skin branch rather than all Skins or all hero mods", () => {
    const selection = { categories: ["Skins"], keys: [], heroes: ["Abrams"] };
    expect(catalogQueryFilterSelection(selection, paths, false)).toEqual(
      selection,
    );
    expect(catalogQueryFilterSelection(selection, paths, true)).toEqual({
      categories: [],
      keys: [abrams.key],
      heroes: [],
    });
    expect(
      catalogQueryFilterSelection(
        { categories: ["Skins", "HUD"], keys: [], heroes: ["Abrams", "Ivy"] },
        paths,
        true,
      ),
    ).toEqual({ categories: ["HUD"], keys: [abrams.key, ivy.key], heroes: [] });
  });

  it("excludes only the selected skin type, preserving unrelated exclusions", () => {
    expect(
      catalogQueryFilterSelection(
        {
          categories: ["HUD"],
          keys: [faithful.key, walker.key],
          heroes: ["Abrams"],
        },
        paths,
        true,
      ),
    ).toEqual({
      categories: ["HUD"],
      keys: [faithful.key, walker.key],
      heroes: [],
    });
    const independent = {
      categories: ["HUD"],
      keys: [walker.key],
      heroes: ["Abrams"],
    };
    expect(catalogQueryFilterSelection(independent, paths, true)).toEqual(
      independent,
    );
  });

  it("preserves independent exclusions while the taxonomy is unavailable", () => {
    const independent = { categories: ["Skins"], keys: [], heroes: ["Abrams"] };
    expect(catalogQueryFilterSelection(independent, [], true)).toEqual(
      independent,
    );
  });
});
