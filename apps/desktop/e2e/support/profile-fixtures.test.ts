import { expect, it } from "bun:test";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { readProfileState } from "./profile-oracle";
import { createWorld, removeOwnedWorld, collectFileInventory } from "./world";
import path from "node:path";

it("prepares an arbitrary installed profile independently of Alpha and Beta", async () => {
  const world = await createWorld({
    runId: "recipe",
    caseId: "recipe",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  try {
    const profile = { id: "gamma", folder: "gamma_profile", name: "Gamma" };
    await prepareInstalledProfiles(
      world,
      [{ profile, modIds: ["local-gamma"] }],
      profile.id,
    );
    expect((await readProfileState(world.directory)).activeProfileId).toBe(
      "gamma",
    );
    expect(
      Object.keys(
        await collectFileInventory(
          path.join(
            world.configuration.roots.game,
            "game",
            "citadel",
            "addons",
            profile.folder,
          ),
        ),
      ).sort(),
    ).toEqual([".dmm.json", "pak01_dir.vpk", "protected.txt"]);
    await expect(
      prepareInstalledProfiles(
        world,
        [{ profile: { ...profile, folder: "../escape" }, modIds: [] }],
        profile.id,
      ),
    ).rejects.toThrow("Unsafe");
  } finally {
    await removeOwnedWorld(world.directory);
  }
});
