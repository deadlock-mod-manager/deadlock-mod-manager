import { describe, expect, it } from "bun:test";
import type { HeroModGroup } from "@/lib/mods/hero-mods";
import type { ModFileTree } from "@/types/mods";
import {
  bulkSelectableSkins,
  canRandomizeSkin,
  currentOutcome,
  isRandomizedPool,
  pickRandomOutcome,
  randomizerPool,
} from "./skin-randomizer";

type TestSkin = {
  remoteId: string;
  usesCriticalPaths?: boolean;
  installedFileTree?: ModFileTree;
  installedVpks?: string[];
};

const singleFile: ModFileTree = {
  files: [
    {
      name: "a.vpk",
      path: "a.vpk",
      size: 1,
      is_selected: true,
      archive_name: "",
    },
  ],
  total_files: 1,
  has_multiple_files: false,
};

// Two files from the same archive: the user has to pick which ones to install.
const needsPick: ModFileTree = {
  files: [
    {
      name: "a.vpk",
      path: "a.vpk",
      size: 1,
      is_selected: true,
      archive_name: "x",
    },
    {
      name: "b.vpk",
      path: "b.vpk",
      size: 1,
      is_selected: false,
      archive_name: "x",
    },
  ],
  total_files: 2,
  has_multiple_files: true,
};

const skin = (
  remoteId: string,
  overrides: Partial<TestSkin> = {},
): TestSkin => ({
  remoteId,
  installedFileTree: singleFile,
  ...overrides,
});

const group = (...skins: TestSkin[]): HeroModGroup<TestSkin> => ({
  skins,
  extras: [],
  activeSkins: [],
  activeExtras: [],
});

describe("canRandomizeSkin", () => {
  it("accepts a skin that installs without questions", () => {
    expect(canRandomizeSkin(skin("a"))).toBe(true);
  });

  it("rejects a skin that writes to critical paths", () => {
    expect(canRandomizeSkin(skin("a", { usesCriticalPaths: true }))).toBe(
      false,
    );
  });

  it("rejects a skin whose variant was never picked", () => {
    expect(canRandomizeSkin(skin("a", { installedFileTree: needsPick }))).toBe(
      false,
    );
  });

  it("accepts a variant skin once a previous install picked the files", () => {
    expect(
      canRandomizeSkin(
        skin("a", {
          installedFileTree: needsPick,
          installedVpks: ["pak01_dir.vpk"],
        }),
      ),
    ).toBe(true);
  });

  it("leaves a skin without a stored file tree to the launch", () => {
    expect(canRandomizeSkin(skin("a", { installedFileTree: undefined }))).toBe(
      true,
    );
  });
});

describe("randomizerPool", () => {
  it("holds only the selected skins", () => {
    const pool = randomizerPool(
      "Haze",
      group(skin("a"), skin("b"), skin("c")),
      {
        skins: { a: true, c: true },
        defaultHeroes: {},
      },
    );
    expect(pool.map((entry) => entry?.remoteId)).toEqual(["a", "c"]);
  });

  it("adds the default look when the hero allows it", () => {
    const pool = randomizerPool("Haze", group(skin("a")), {
      skins: { a: true },
      defaultHeroes: { Haze: true },
    });
    expect(pool).toEqual([null, skin("a")]);
    expect(isRandomizedPool(pool)).toBe(true);
  });

  it("leaves out selected skins that cannot be installed silently", () => {
    const pool = randomizerPool(
      "Haze",
      group(skin("a"), skin("b", { usesCriticalPaths: true })),
      { skins: { a: true, b: true }, defaultHeroes: {} },
    );
    expect(isRandomizedPool(pool)).toBe(false);
  });
});

describe("pickRandomOutcome", () => {
  const pool = [null, skin("a"), skin("b")];

  it("maps the random range evenly onto the pool", () => {
    expect(pickRandomOutcome(pool, undefined, () => 0)).toBeNull();
    expect(pickRandomOutcome(pool, undefined, () => 0.5)?.remoteId).toBe("a");
    expect(pickRandomOutcome(pool, undefined, () => 0.99)?.remoteId).toBe("b");
  });

  it("stays in range for a random source that returns 1", () => {
    expect(pickRandomOutcome(pool, undefined, () => 1)?.remoteId).toBe("b");
  });

  it("never repeats the skin the hero wore last", () => {
    for (const roll of [0, 0.4, 0.6, 0.99]) {
      expect(pickRandomOutcome(pool, skin("a"), () => roll)?.remoteId).not.toBe(
        "a",
      );
    }
  });

  it("never repeats the default look the hero wore last", () => {
    for (const roll of [0, 0.4, 0.6, 0.99]) {
      expect(pickRandomOutcome(pool, null, () => roll)).not.toBeNull();
    }
  });

  it("alternates when the pool holds two", () => {
    expect(
      pickRandomOutcome([skin("a"), skin("b")], skin("b"), () => 0.99)
        ?.remoteId,
    ).toBe("a");
  });

  it("rolls from the whole pool when last time is not in it", () => {
    expect(pickRandomOutcome(pool, skin("z"), () => 0.99)?.remoteId).toBe("b");
  });
});

describe("currentOutcome", () => {
  it("is the default look when no skin is installed", () => {
    expect(currentOutcome(group(skin("a")))).toBeNull();
  });

  it("is the one installed skin", () => {
    expect(
      currentOutcome({ ...group(skin("a")), activeSkins: [skin("a")] })
        ?.remoteId,
    ).toBe("a");
  });

  it("is unknown with several skins installed", () => {
    expect(
      currentOutcome({
        ...group(skin("a"), skin("b")),
        activeSkins: [skin("a"), skin("b")],
      }),
    ).toBeUndefined();
  });
});

describe("bulkSelectableSkins", () => {
  const groups = new Map([
    ["Haze", group(skin("h1"), skin("h2"))],
    ["Wraith", group(skin("w1"))],
    ["Vindicta", group(skin("v1"), skin("v2", { usesCriticalPaths: true }))],
  ]);

  it("selects heroes with at least two skins to choose between", () => {
    expect(bulkSelectableSkins(groups, {})).toEqual(["h1", "h2"]);
  });

  it("counts the default look towards the minimum", () => {
    expect(
      bulkSelectableSkins(groups, { Wraith: true, Vindicta: true }),
    ).toEqual(["h1", "h2", "w1", "v1"]);
  });
});
