import { describe, expect, it } from "bun:test";
import { assignAbilitySlots } from "./preview-actions";

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
});
