import { expect, test } from "bun:test";
import { previewHeroAbilities } from "./preview-hero";

test("uses installed abilities for an unregistered hero without a network roster", () => {
  expect(
    previewHeroAbilities(
      "models/new/body.vmdl_c",
      [{ className: "new_power", name: "Void Step" }],
      [],
    ),
  ).toEqual([{ className: "new_power", name: "Void Step", image: null }]);
});

test("keeps installed slot order and enriches by class instead of model folder", () => {
  const abilities = previewHeroAbilities(
    "models/custom/body.vmdl_c",
    [
      { className: "new_power", name: "Local" },
      { className: "second_power", name: "Second" },
    ],
    [
      {
        modelDirectory: "models/old/",
        abilities: [
          {
            className: "citadel_ability_new_power",
            name: "Void Step",
            image: "icon.webp",
          },
          { className: "obsolete", name: "Old", image: null },
        ],
      },
    ],
  );
  expect(abilities.map((x) => x.className)).toEqual([
    "new_power",
    "second_power",
  ]);
  expect(abilities[0].image).toBe("icon.webp");
  expect(abilities[0].name).toBe("Void Step");
});
