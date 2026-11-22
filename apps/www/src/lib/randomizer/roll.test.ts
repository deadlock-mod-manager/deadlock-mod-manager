import { describe, expect, it } from "vitest";
import {
  abilitySchema,
  type DeadlockAbility,
  type DeadlockHero,
  type DeadlockUpgrade,
  heroSlug,
  ITEM_CATEGORIES,
  type ItemCategory,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import {
  ABILITY_SLOTS,
  AP_COSTS,
  CHARGE_ITEMS,
  finalItem,
  type RolledItem,
  rollLoadout,
  SLOTS_PER_CATEGORY,
  SOUL_BUDGET,
  unlockGates,
} from "./roll";

/** Everything a slot puts in the inventory at some point. */
const itemsOf = (entry: RolledItem): DeadlockUpgrade[] =>
  entry.upgrade ? [entry.item, entry.upgrade] : [entry.item];

const TIER_COSTS = [800, 1600, 3200, 6400];
const TIERS = [1, 2, 3, 4];
const ITEMS_PER_TIER = 7;

const makeUpgrade = (
  category: ItemCategory,
  tier: number,
  index: number,
  overrides: Partial<DeadlockUpgrade> = {},
): DeadlockUpgrade => ({
  id: index,
  class_name: `upgrade_${category}_${tier}_${index}`,
  name: `${category} ${tier}-${index}`,
  type: "upgrade",
  item_slot_type: category,
  item_tier: tier,
  cost: TIER_COSTS[tier - 1],
  shopable: true,
  shop_image: "https://example.invalid/item.png",
  properties: {},
  tooltip_sections: [],
  description: {},
  ...overrides,
});

const CHARGE_UPGRADES: DeadlockUpgrade[] = [
  makeUpgrade("spirit", 1, 90, { class_name: "upgrade_extra_charge" }),
  makeUpgrade("spirit", 3, 91, {
    class_name: "upgrade_rapid_recharge",
    component_items: ["upgrade_extra_charge"],
  }),
  makeUpgrade("weapon", 2, 92, { class_name: "upgrade_rechargingbullets" }),
];

const UPGRADES: DeadlockUpgrade[] = [
  ...ITEM_CATEGORIES.flatMap((category) =>
    TIERS.flatMap((tier) =>
      Array.from({ length: ITEMS_PER_TIER }, (_, index) =>
        makeUpgrade(category, tier, index, {
          // Every tier 3 item is built out of the first tier 1 item of its
          // category, so the roll has real component conflicts to avoid.
          component_items: tier === 3 ? [`upgrade_${category}_1_0`] : undefined,
          imbue:
            tier === 4 && index === 0
              ? "imbue_active_non_ult"
              : tier === 3 && index === 1
                ? "imbue_modifier_value"
                : undefined,
        }),
      ),
    ),
  ),
  ...CHARGE_UPGRADES,
];

const makeAbility = (className: string, charges: number): DeadlockAbility =>
  abilitySchema.parse({
    id: 1,
    class_name: className,
    name: className,
    type: "ability",
    ability_type: "signature",
    properties: { AbilityCharges: { value: String(charges) } },
  });

/** A kit with no charged ability at all. */
const UNCHARGED_ABILITIES = new Map(
  ["ability_one", "ability_two", "ability_three", "ability_four"].map(
    (name) => [name, makeAbility(name, 0)],
  ),
);

/** Level table of the live game: unlocks at levels 1, 3, 5 and 8. */
const LEVEL_INFO: DeadlockHero["level_info"] = Object.fromEntries(
  Array.from({ length: 36 }, (_, index) => {
    const level = index + 1;
    const unlock = [1, 3, 5, 8].includes(level);
    return [
      String(level),
      {
        required_gold: index * 500,
        bonus_currencies: [unlock ? "EAbilityUnlocks" : "EAbilityPoints"],
      },
    ];
  }),
);

/** Every item but the last of each tier, mirroring a real per-hero draft pool. */
const draftBucketing = (
  excluded: Set<string> = new Set(),
): DeadlockHero["item_draft_bucketing"] =>
  Object.fromEntries(
    UPGRADES.filter((item) => !excluded.has(item.class_name)).map((item) => [
      item.class_name,
      { bucket: item.item_tier % 2 === 0 ? "Good" : "Normal", weight: 1 },
    ]),
  );

const makeHero = (
  id: number,
  overrides: Partial<DeadlockHero> = {},
): DeadlockHero => ({
  id,
  class_name: `hero_${id}`,
  name: `Hero ${id}`,
  complexity: 2,
  player_selectable: true,
  disabled: false,
  in_development: false,
  description: {},
  images: {},
  items: {
    signature1: "ability_one",
    signature2: "ability_two",
    signature3: "ability_three",
    signature4: "ability_four",
  },
  item_slot_info: {
    weapon: { max_purchases_for_tier: [6, 6, 6] },
    vitality: { max_purchases_for_tier: [6, 6, 6] },
    spirit: { max_purchases_for_tier: [6, 6, 6] },
  },
  item_draft_bucketing: draftBucketing(),
  level_info: LEVEL_INFO,
  colors: {},
  ...overrides,
});

/** Drafts no spirit items at all, and nothing above tier 3. */
const NARROW_POOL = new Set(
  UPGRADES.filter(
    (item) => item.item_slot_type === "spirit" || item.item_tier > 3,
  ).map((item) => item.class_name),
);

const NARROW_HERO = makeHero(99, {
  name: "Narrow",
  item_draft_bucketing: draftBucketing(NARROW_POOL),
});

const CAPPED_HERO = makeHero(98, {
  name: "Capped",
  item_slot_info: {
    weapon: { max_purchases_for_tier: [1, 1, 1] },
    vitality: { max_purchases_for_tier: [2, 2, 0] },
    spirit: { max_purchases_for_tier: [6, 6, 6] },
  },
});

const HEROES = [makeHero(1), makeHero(2), NARROW_HERO, CAPPED_HERO];

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 13);

describe("rollLoadout", () => {
  it("is fully determined by its seed", () => {
    const first = rollLoadout(4242, HEROES, UPGRADES);
    const second = rollLoadout(4242, HEROES, UPGRADES);

    expect(second.hero.id).toBe(first.hero.id);
    expect(second.build.map((entry) => entry.item.class_name)).toEqual(
      first.build.map((entry) => entry.item.class_name),
    );
    expect(second.abilityOrder).toEqual(first.abilityOrder);
    expect(second.challenges).toEqual(first.challenges);
  });

  it("never buys the same item twice", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      const names = build.flatMap(itemsOf).map((item) => item.class_name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("never spends a second slot on a component another slot contains", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const entry of build) {
        const others = new Set(
          build
            .filter((other) => other !== entry)
            .flatMap(itemsOf)
            .map((item) => item.class_name),
        );
        for (const item of itemsOf(entry)) {
          for (const component of item.component_items ?? []) {
            expect(others.has(component)).toBe(false);
          }
        }
      }
    }
  });

  it("only upgrades an item into something built from it", () => {
    let upgraded = 0;
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const { item, upgrade } of build) {
        if (!upgrade) {
          continue;
        }
        upgraded += 1;
        expect(upgrade.component_items).toContain(item.class_name);
        expect(upgrade.item_slot_type).toBe(item.item_slot_type);
      }
    }
    expect(upgraded).toBeGreaterThan(0);
  });

  it("only buys items the rolled hero actually drafts", () => {
    for (const seed of SEEDS) {
      const { hero, build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const item of build.flatMap(itemsOf)) {
        expect(hero.item_draft_bucketing[item.class_name]).toBeDefined();
      }
    }
  });

  it("keeps a narrow draft pool inside its bounds", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, [NARROW_HERO], UPGRADES);
      expect(build.length).toBeGreaterThan(0);
      for (const item of build.flatMap(itemsOf)) {
        expect(item.item_slot_type).not.toBe("spirit");
        expect(item.item_tier).toBeLessThanOrEqual(3);
      }
    }
  });

  it("keeps charge items away from heroes without a charged ability", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES, {
        abilities: UNCHARGED_ABILITIES,
      });
      for (const item of build.flatMap(itemsOf)) {
        expect(CHARGE_ITEMS.has(item.class_name)).toBe(false);
      }
    }
  });

  it("still offers charge items to heroes with a charged ability", () => {
    const charged = new Map(UNCHARGED_ABILITIES);
    charged.set("ability_two", makeAbility("ability_two", 2));
    const rolled = SEEDS.flatMap((seed) =>
      rollLoadout(seed, HEROES, UPGRADES, { abilities: charged }).build.flatMap(
        itemsOf,
      ),
    );
    expect(rolled.some((item) => CHARGE_ITEMS.has(item.class_name))).toBe(true);
  });

  it("locks the roll to the chosen hero", () => {
    const chosen = HEROES[1];
    for (const seed of SEEDS) {
      const roll = rollLoadout(seed, HEROES, UPGRADES, {
        heroSlug: heroSlug(chosen),
      });
      expect(roll.hero.id).toBe(chosen.id);
    }
  });

  it("rolls any hero when the chosen one does not exist", () => {
    const free = rollLoadout(4242, HEROES, UPGRADES);
    const unknown = rollLoadout(4242, HEROES, UPGRADES, {
      heroSlug: "nobody",
    });
    expect(unknown.hero.id).toBe(free.hero.id);
  });

  it("respects each hero's per-tier purchase limits", () => {
    for (const seed of SEEDS) {
      const { hero, build } = rollLoadout(seed, HEROES, UPGRADES);
      const counts = new Map<string, number>();
      for (const item of build.map(finalItem)) {
        const key = `${item.item_slot_type}:${item.item_tier}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of counts) {
        const [category, tier] = key.split(":");
        const cap =
          hero.item_slot_info[category]?.max_purchases_for_tier?.[
            Number(tier) - 1
          ] ?? SLOTS_PER_CATEGORY;
        expect(count).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("fills at most four slots per category", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const category of ITEM_CATEGORIES) {
        const count = build.filter(
          (entry) => entry.item.item_slot_type === category,
        ).length;
        expect(count).toBeLessThanOrEqual(SLOTS_PER_CATEGORY);
      }
    }
  });

  it("orders the build so the tier it ends up at only ever goes up", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (let index = 1; index < build.length; index++) {
        expect(finalItem(build[index]).item_tier).toBeGreaterThanOrEqual(
          finalItem(build[index - 1]).item_tier,
        );
      }
    }
  });

  it("ends every full build on late game items", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, [HEROES[0]], UPGRADES);
      expect(finalItem(build.at(-1) ?? build[0]).item_tier).toBe(4);
    }
  });

  it("skills every ability four times, unlock first", () => {
    for (const seed of SEEDS) {
      const { skillOrder, unlockOrder } = rollLoadout(seed, HEROES, UPGRADES);
      expect(skillOrder).toHaveLength(ABILITY_SLOTS * (AP_COSTS.length + 1));
      expect(
        skillOrder
          .filter((step) => step.kind === "unlock")
          .map((step) => step.slot),
      ).toEqual(unlockOrder);
      for (let slot = 1; slot <= ABILITY_SLOTS; slot++) {
        const own = skillOrder.filter((step) => step.slot === slot);
        expect(own).toHaveLength(4);
        expect(own[0].kind).toBe("unlock");
      }
      // The ultimate unlock waits for the other three.
      const ultUnlock = skillOrder.findIndex(
        (step) => step.kind === "unlock" && step.slot === ULTIMATE_SLOT,
      );
      const otherUnlocks = skillOrder.filter(
        (step, index) => step.kind === "unlock" && index < ultUnlock,
      );
      expect(otherUnlocks).toHaveLength(ABILITY_SLOTS - 1);
    }
  });

  it("imbues only imbuable items, and keeps non-ult imbues off the ultimate", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const entry of build) {
        const { imbueSlot } = entry;
        const items = itemsOf(entry);
        expect(imbueSlot !== undefined).toBe(
          items.some((item) => Boolean(item.imbue)),
        );
        if (imbueSlot === undefined) {
          continue;
        }
        expect(imbueSlot).toBeGreaterThanOrEqual(1);
        expect(imbueSlot).toBeLessThanOrEqual(ABILITY_SLOTS);
        if (items.some((item) => item.imbue === "imbue_active_non_ult")) {
          expect(imbueSlot).not.toBe(ULTIMATE_SLOT);
        }
      }
    }
  });

  it("spends every ability point in a legal order", () => {
    const totalAp =
      ABILITY_SLOTS * AP_COSTS.reduce((sum, cost) => sum + cost, 0);

    for (const seed of SEEDS) {
      const { abilityOrder } = rollLoadout(seed, HEROES, UPGRADES);
      expect(abilityOrder).toHaveLength(ABILITY_SLOTS * AP_COSTS.length);
      expect(abilityOrder.at(-1)?.apSpent).toBe(totalAp);

      const taken = new Map<number, number>();
      let running = 0;
      for (const step of abilityOrder) {
        const previous = taken.get(step.slot) ?? 0;
        expect(step.step).toBe(previous + 1);
        expect(step.apCost).toBe(AP_COSTS[previous]);
        running += step.apCost;
        expect(step.apSpent).toBe(running);
        taken.set(step.slot, step.step);
      }
    }
  });

  it("reads the unlock gates off the level table", () => {
    expect(unlockGates(makeHero(1))).toEqual([1, 2, 3, 5]);
    expect(unlockGates(makeHero(1, { level_info: {} }))).toEqual([1, 2, 3, 5]);
  });

  it("unlocks the ultimate last and never upgrades a locked ability", () => {
    const gates = [1, 2, 3, 5];
    for (const seed of SEEDS) {
      const { unlockOrder, abilityOrder } = rollLoadout(seed, HEROES, UPGRADES);
      expect(unlockOrder).toHaveLength(ABILITY_SLOTS);
      expect(new Set(unlockOrder).size).toBe(ABILITY_SLOTS);
      expect(unlockOrder.at(-1)).toBe(ULTIMATE_SLOT);
      for (const step of abilityOrder) {
        expect(step.apSpent).toBeGreaterThanOrEqual(
          gates[unlockOrder.indexOf(step.slot)],
        );
      }
    }
  });

  it("totals souls across the three categories", () => {
    for (const seed of SEEDS) {
      const { build, totalSouls, soulsByCategory } = rollLoadout(
        seed,
        HEROES,
        UPGRADES,
      );
      // An upgrade takes the component's cost off its price, so a slot costs
      // exactly what ends up in it.
      const expected = build.reduce(
        (sum, entry) => sum + (finalItem(entry).cost ?? 0),
        0,
      );
      expect(totalSouls).toBe(expected);
      expect(
        ITEM_CATEGORIES.reduce(
          (sum, category) => sum + soulsByCategory[category],
          0,
        ),
      ).toBe(expected);
    }
  });

  it("keeps every build inside a realistic soul budget", () => {
    for (const seed of SEEDS) {
      const { totalSouls } = rollLoadout(seed, HEROES, UPGRADES);
      expect(totalSouls).toBeLessThanOrEqual(SOUL_BUDGET);
    }
  });

  it("only buys items that carry a real price", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const item of build.flatMap(itemsOf)) {
        expect(item.cost).toBeGreaterThan(0);
        expect(item.cost).not.toBe(9999);
      }
    }
  });

  it("falls back to the whole shop when the draft map matches nothing", () => {
    const strangerHero = makeHero(51, {
      item_draft_bucketing: {
        upgrade_renamed_by_a_patch: { bucket: "Good", weight: 1 },
      },
    });
    const { build, draftPoolSize } = rollLoadout(9, [strangerHero], UPGRADES);

    expect(build).toHaveLength(SLOTS_PER_CATEGORY * ITEM_CATEGORIES.length);
    expect(draftPoolSize).toBe(UPGRADES.length);
  });

  it("falls back to the whole shop when a hero has no draft data", () => {
    const heroWithoutDraft = makeHero(50, { item_draft_bucketing: {} });
    const { build, draftPoolSize } = rollLoadout(
      7,
      [heroWithoutDraft],
      UPGRADES,
    );

    expect(draftPoolSize).toBe(UPGRADES.length);
    expect(build.length).toBeGreaterThan(0);
  });
});
