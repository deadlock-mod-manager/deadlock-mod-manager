import { describe, expect, test } from "bun:test";
import { PERFORMANCE_CONFIG_CATEGORY } from "@deadlock-mods/shared";
import { configListing } from "./config-listing";

const mod = (name: string, category: string, remoteId = "1") => ({
  remoteId,
  name,
  category,
  tags: [],
});

const catalogConfigs = new Map([
  ["650519", false],
  ["671812", true],
]);

describe("configListing", () => {
  test("confirms flagged uploads and the ones the catalog lists", () => {
    expect(
      configListing(
        mod("Potato Lock", PERFORMANCE_CONFIG_CATEGORY),
        catalogConfigs,
      ),
    ).toBe("confirmed");
    expect(
      configListing(mod("Optimisationlock", "Skins", "650519"), catalogConfigs),
    ).toBe("confirmed");
  });

  test("keeps Install for catalog configs that also ship VPKs", () => {
    expect(
      configListing(
        mod("OptimizationDL", "Quality of Life/Fixes", "671812"),
        catalogConfigs,
      ),
    ).toBe("likely");
  });

  test("only hints in the categories configs are uploaded to", () => {
    expect(
      configListing(
        mod("OptiLock FPS Configs", "Quality of Life/Fixes"),
        catalogConfigs,
      ),
    ).toBe("likely");
    expect(
      configListing(mod("Full FPS UP cfg", "Other/Misc"), catalogConfigs),
    ).toBe("likely");
    expect(
      configListing(
        mod("Clutter Be Gone", "Quality of Life/Fixes"),
        catalogConfigs,
      ),
    ).toBeNull();
    expect(
      configListing(
        mod("Optimized Soul Container", "Model Replacement"),
        catalogConfigs,
      ),
    ).toBeNull();
  });
});
