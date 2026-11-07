import { expect, test } from "bun:test";
import { fixtureGamePaths } from "./gameinfo-mounts";

test("reads fixture mount values independently of quotes and ownership comments", () => {
  expect(
    fixtureGamePaths(
      [
        "  Game citadel/addons/profile_alpha // dmm-search-path",
        '  "Game" "citadel/addons2/profile_alpha" // a user comment',
        "  Game citadel/dmm_localization_default // dmm-search-path",
        "  Game core",
        "  // Game not_a_mount",
        "  Mod citadel",
        "  Game linux_only [$LINUX]",
      ].join("\r\n"),
    ),
  ).toEqual([
    "citadel/addons/profile_alpha",
    "citadel/addons2/profile_alpha",
    "citadel/dmm_localization_default",
    "core",
  ]);
});
