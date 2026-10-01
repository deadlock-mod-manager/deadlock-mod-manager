import { expect, test } from "vitest";
import { DeadlockHeroes } from "../constants";
import {
  guessHero,
  normalizeHero,
  resolveHeroFromSkinCategory,
} from "../heroes";

test("guessHero", () => {
  expect(guessHero("Raiden | Yamato Skin")).toBe(DeadlockHeroes.Yamato);
  expect(guessHero("Viscous")).toBe(DeadlockHeroes.Viscous);
  expect(guessHero("Alternative Geist")).toBe(DeadlockHeroes.LadyGeist);
  expect(guessHero("Victor Skin Pack")).toBe(DeadlockHeroes.Victor);
  expect(guessHero("Toon Viktor")).toBe(DeadlockHeroes.Victor);
  expect(guessHero("Toon 7")).toBe(DeadlockHeroes.Seven);
  expect(guessHero("Yoshi -> Rem")).toBe(DeadlockHeroes.Rem);
});

test("normalizeHero", () => {
  expect(normalizeHero("Victor")).toBe(DeadlockHeroes.Victor);
  expect(normalizeHero("Viktor")).toBe(DeadlockHeroes.Victor);
  expect(normalizeHero("LadyGeist")).toBe(DeadlockHeroes.LadyGeist);
  expect(normalizeHero("MoKrill")).toBe(DeadlockHeroes.MoKrill);
  expect(normalizeHero("gigawatt_prisoner")).toBe(DeadlockHeroes.Seven);
  expect(normalizeHero("not a hero")).toBeNull();
});

test("guessHero avoids common substring false positives", () => {
  expect(guessHero("ZZZ Trigger Vindicta remodel")).toBe(
    DeadlockHeroes.Vindicta,
  );
  expect(guessHero("Slash effect pack")).toBeNull();
  expect(guessHero("Seventh anniversary pack")).toBeNull();
  expect(guessHero("Ladybug skin pack")).toBeNull();
  expect(guessHero("Remodel pack")).toBeNull();
});

test("resolves heroes by codename, enum key and multi-word name", () => {
  expect(normalizeHero("RatKing")).toBe(DeadlockHeroes.RatKing);
  expect(normalizeHero("NurseHarrow")).toBe(DeadlockHeroes.NurseHarrow);
  expect(normalizeHero("deadpack")).toBe(DeadlockHeroes.DeadmanDanny);
  expect(normalizeHero("chessmaster")).toBe(DeadlockHeroes.Solomon);
  expect(guessHero("Violet Painter Outfit")).toBe(DeadlockHeroes.Violet);
  expect(guessHero("Deadman Danny Crash Test")).toBe(
    DeadlockHeroes.DeadmanDanny,
  );
  expect(guessHero("Nurse Harrow VO")).toBe(DeadlockHeroes.NurseHarrow);
  expect(guessHero("Rat King recolor")).toBe(DeadlockHeroes.RatKing);
  expect(guessHero("NurseHarrow skin")).toBe(DeadlockHeroes.NurseHarrow);
  expect(guessHero("Baba tea set")).toBe(DeadlockHeroes.Baba);
});

test("one word of a two-word hero name or a common-word codename doesn't match", () => {
  expect(guessHero("Warden as Makina from Deadman Wonderland")).toBe(
    DeadlockHeroes.Warden,
  );
  expect(guessHero("Harrow Grey Talon")).toBe(DeadlockHeroes.GreyTalon);
  expect(guessHero("Nurse outfit for Ivy")).toBe(DeadlockHeroes.Ivy);
});

test("resolveHeroFromSkinCategory", () => {
  expect(resolveHeroFromSkinCategory("Skins", "Seven", "Toon Seven")).toBe(
    DeadlockHeroes.Seven,
  );
  expect(resolveHeroFromSkinCategory("Skins", "Skins", "Toon Viktor")).toBe(
    DeadlockHeroes.Victor,
  );
  expect(
    resolveHeroFromSkinCategory("Maps", "Victor", "Generic Map Pack"),
  ).toBeNull();
  expect(resolveHeroFromSkinCategory("Skins", "Other", "Toon Viktor")).toBe(
    DeadlockHeroes.Victor,
  );
});
