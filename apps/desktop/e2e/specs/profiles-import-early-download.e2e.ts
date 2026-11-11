// Importing a share code downloads each mod while it looks up the next one's
// files. The scenario's network check asserts the overlap.
import assert from "node:assert/strict";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { importShareCode, readShareState } from "../support/profile-share";
import { SHARE_CODE, SHARE_MODS } from "../support/profile-share-fixtures";
import { navigate } from "../support/ui";

describe("profile import with slow file lookups", () => {
  it("installs every mod", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const profile = await importShareCode(world, SHARE_CODE);
    await step("every shared mod is installed", async () => {
      const state = await readShareState(world);
      assert.deepEqual(
        Object.fromEntries(
          (state.profiles[profile.id]?.mods ?? []).map((mod) => [
            mod.remoteId,
            mod.status,
          ]),
        ),
        Object.fromEntries(SHARE_MODS.map((mod) => [mod.id, "installed"])),
      );
    });
    await closeApplication(world, runtime.processId);
  });
});
