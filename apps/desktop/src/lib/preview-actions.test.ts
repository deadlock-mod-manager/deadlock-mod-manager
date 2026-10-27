import { describe, expect, it } from "bun:test";
import { abilityForAction, assignAbilitySlots } from "./preview-actions";

const ability = (className: string, name: string) => ({
  className,
  name,
  image: null,
});
const action = (stem: string) => ({
  id: `ability:${stem}`,
  kind: "ability" as const,
  label: stem,
  clips: [],
});

describe("preview ability slots", () => {
  it("resolves effects for alternate clips that did not claim the ability bar slot", () => {
    const abilities = [
      ability("shiv_dagger", "Serrated Knives"),
      ability("shiv_dash", "Slice and Dice"),
      ability("shiv_defer_damage", "Bloodletting"),
      ability("shiv_killing_blow", "Killing Blow"),
    ];
    const actions = [
      action("shiv_killingblow"),
      action("shiv_killingblow_leap"),
      action("shiv_killingblow_slash"),
    ];
    expect(assignAbilitySlots(actions, abilities).rest).toHaveLength(2);
    expect(abilityForAction(actions[2], abilities)?.className).toBe(
      "shiv_killing_blow",
    );
    expect(abilityForAction(action("generic"), abilities)).toBeNull();
  });
  it("puts an ability action on the one slot it names best", () => {
    const { slots, rest } = assignAbilitySlots(
      [action("pain"), action("frank"), action("jumpstart"), action("ult")],
      [
        ability("frank_shocktarget2", "Pain Battery"),
        ability("frank_selfzap", "Jumpstart"),
        ability("frank_painaura", "Aura of Suffering"),
        ability("frank_revive", "Shocking Reanimation"),
      ],
    );
    // `pain` is a whole word of "Pain Battery" and only part of `painaura`;
    // `frank` names every slot, so it is left for the action list.
    expect(slots.map((slot) => slot.action?.id ?? null)).toEqual([
      "ability:pain",
      "ability:jumpstart",
      null,
      "ability:ult",
    ]);
    expect(rest.map((entry) => entry.id)).toEqual(["ability:frank"]);
  });

  it("matches multi-word clip stems against squashed ability names", () => {
    const { slots } = assignAbilitySlots(
      [action("goo_ball"), action("puddle_punch")],
      [
        ability("viscous_goo_grenade", "Splatter"),
        ability("viscous_restorative_goo", "The Cube"),
        ability("viscous_telepunch", "Puddle Punch"),
        ability("viscous_goo_bowling_ball", "Goo Ball"),
      ],
    );
    expect(slots.map((slot) => slot.action?.id ?? null)).toEqual([
      null,
      null,
      "ability:puddle_punch",
      "ability:goo_ball",
    ]);
  });

  it("falls back to a stem's words only when the whole stem names no slot", () => {
    const { slots, rest } = assignAbilitySlots(
      [
        action("idle_sentry"),
        action("sentry"),
        action("stalker_claw"),
        action("superslash_ult"),
      ],
      [
        ability("shieldedsentry", "Mini Turret"),
        ability("drifter_shadow_mark", "Stalker's Mark"),
        ability("ability_drifter_hunger", "Bloodscent"),
        ability("ability_fencer_ultimate", "Itani Lo Sahn"),
      ],
    );
    expect(slots.map((slot) => slot.action?.id ?? null)).toEqual([
      "ability:sentry",
      "ability:stalker_claw",
      null,
      "ability:superslash_ult",
    ]);
    expect(rest.map((entry) => entry.id)).toEqual(["ability:idle_sentry"]);
  });

  it("lets clips found by an ability's name claim its slot first", () => {
    const { slots, rest } = assignAbilitySlots(
      [action("last"), { ...action("strix_salvo"), ability: "Strix Salvo" }],
      [
        ability("ability_deadpack_chargeblast", "Strix Salvo"),
        ability("ability_deadpack_rocketeer", "Chimera Mk1"),
      ],
    );
    // `last` is part of `chargeblast`, but the salvo clips spell the name.
    expect(slots[0].action?.id).toBe("ability:strix_salvo");
    expect(rest.map((entry) => entry.id)).toEqual(["ability:last"]);
  });

  it("does not let a shared class prefix tie every slot", () => {
    const { slots } = assignAbilitySlots(
      [action("unicorn_radiant_blast"), action("unicorn_dazzlingorb")],
      [
        ability("ability_unicorn_radiantblast", "Light Eater"),
        ability("ability_unicorn_prismaticguard", "Dazzling Trick"),
        ability("ability_unicorn_luminousstrike", "Radiant Daggers"),
        ability("ability_unicorn_dazzlingorb", "Shining Wonder"),
      ],
    );
    expect(slots.map((slot) => slot.action?.id ?? null)).toEqual([
      "ability:unicorn_radiant_blast",
      null,
      null,
      "ability:unicorn_dazzlingorb",
    ]);
  });
});
