import { expect, test } from "vitest";
import { DeadlockHeroes } from "../constants";
import { guessHero, normalizeHero } from "../heroes";

test("guessHero", () => {
  expect(guessHero("Raiden | Yamato Skin")).toBe(DeadlockHeroes.Yamato);
  expect(guessHero("Viscous")).toBe(DeadlockHeroes.Viscous);
  expect(guessHero("Alternative Geist")).toBe(DeadlockHeroes.LadyGeist);
  expect(guessHero("Victor Skin Pack")).toBe(DeadlockHeroes.Victor);
  expect(guessHero("Toon Viktor")).toBe(DeadlockHeroes.Victor);
  expect(guessHero("Toon 7")).toBe(DeadlockHeroes.Seven);
  expect(guessHero("Yoshi -> Rem")).toBe(DeadlockHeroes.Rem);
  expect(guessHero("ZZZ Trigger Vindicta remodel")).toBe(
    DeadlockHeroes.Vindicta,
  );
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
