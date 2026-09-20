import { afterEach, describe, expect, it, vi } from "vitest";
import { getHeroes, getUpgrades } from "./deadlock-assets";

const respond = (body: unknown, ok = true) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: () => Promise.resolve(body),
    }),
  );
};

const hero = {
  id: 1,
  class_name: "hero_inferno",
  name: "Infernus",
  player_selectable: true,
  items: { signature1: "ability_one" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHeroes", () => {
  it("throws when the response is not a list", async () => {
    respond({ error: "nope" });
    await expect(getHeroes()).rejects.toThrow(/did not return a list/);
  });

  it("throws when nothing in the response is usable", async () => {
    respond([{ unexpected: true }, { also: "wrong" }]);
    await expect(getHeroes()).rejects.toThrow(/nothing usable/);
  });

  it("throws when the request itself fails", async () => {
    respond([], false);
    await expect(getHeroes()).rejects.toThrow(/responded 503/);
  });

  it("drops a single unparsable entry but keeps the rest", async () => {
    respond([hero, { unexpected: true }, { ...hero, id: 2, name: "Seven" }]);
    const heroes = await getHeroes();
    expect(heroes.map((h) => h.name)).toEqual(["Infernus", "Seven"]);
  });

  it("accepts a genuinely empty roster", async () => {
    respond([]);
    await expect(getHeroes()).resolves.toEqual([]);
  });
});

describe("getUpgrades", () => {
  it("drops items the game has no price for yet", async () => {
    respond([
      {
        id: 1,
        class_name: "upgrade_real",
        name: "Real",
        type: "upgrade",
        item_slot_type: "weapon",
        item_tier: 1,
        cost: 800,
        shopable: true,
      },
      {
        id: 2,
        class_name: "upgrade_unpriced",
        name: "Unpriced",
        type: "upgrade",
        item_slot_type: "weapon",
        item_tier: 5,
        cost: 9999,
        shopable: true,
      },
    ]);
    const upgrades = await getUpgrades();
    expect(upgrades.map((u) => u.class_name)).toEqual(["upgrade_real"]);
  });
});
