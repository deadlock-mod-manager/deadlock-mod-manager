import { describe, expect, test } from "bun:test";
import { PERFORMANCE_CONFIG_CATEGORY } from "@deadlock-mods/shared";
import { configListing } from "./config-listing";

const mod = (name: string, category: string, remoteId = "1") => ({
  remoteId,
  name,
  category,
  tags: [],
});

const catalogIds = new Set(["650519"]);

describe("configListing", () => {
  test("confirms flagged uploads and the ones the catalog lists", () => {
    expect(
      configListing(
        mod("Potato Lock", PERFORMANCE_CONFIG_CATEGORY),
        catalogIds,
      ),
    ).toBe("confirmed");
    expect(
      configListing(mod("Optimisationlock", "Skins", "650519"), catalogIds),
    ).toBe("confirmed");
  });

  test("only hints in the categories configs are uploaded to", () => {
    expect(
      configListing(
        mod("OptiLock FPS Configs", "Quality of Life/Fixes"),
        catalogIds,
      ),
    ).toBe("likely");
    expect(
      configListing(mod("Full FPS UP cfg", "Other/Misc"), catalogIds),
    ).toBe("likely");
    expect(
      configListing(
        mod("Clutter Be Gone", "Quality of Life/Fixes"),
        catalogIds,
      ),
    ).toBeNull();
    expect(
      configListing(
        mod("Optimized Soul Container", "Model Replacement"),
        catalogIds,
      ),
    ).toBeNull();
  });
});
