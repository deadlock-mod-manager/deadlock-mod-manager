import { describe, expect, it } from "bun:test";
import { ModStatus } from "@/types/mods";
import type { ModGroup } from "@/types/profiles";
import { groupRandomizerPools } from "./group-randomizer";

const mod = (
  remoteId: string,
  status: ModStatus,
  usesCriticalPaths = false,
) => ({ remoteId, status, usesCriticalPaths });

const group = (modIds: string[], randomize = true): ModGroup => ({
  id: modIds.join(),
  name: modIds.join(),
  modIds,
  collapsed: false,
  randomize,
});

const ids = (mods: { remoteId: string }[]) => mods.map((m) => m.remoteId);

describe("groupRandomizerPools", () => {
  it("rolls only randomizable members but takes off every installed one", () => {
    const mods = [
      mod("a", ModStatus.Installed),
      mod("b", ModStatus.Downloaded),
      mod("c", ModStatus.Installed, true),
      mod("d", ModStatus.Downloading),
    ];
    const [pool] = groupRandomizerPools(
      [group(["a", "b", "c", "d", "gone"])],
      mods,
    );
    expect(ids(pool.pool)).toEqual(["a", "b"]);
    expect(ids(pool.active)).toEqual(["a", "c"]);
  });

  it("skips groups that are not randomized or have nothing to choose from", () => {
    const mods = [
      mod("a", ModStatus.Downloaded),
      mod("b", ModStatus.Downloaded),
      mod("c", ModStatus.Downloaded),
      mod("d", ModStatus.Downloaded, true),
    ];
    expect(
      groupRandomizerPools([group(["a", "b"], false), group(["c", "d"])], mods),
    ).toEqual([]);
  });
});
