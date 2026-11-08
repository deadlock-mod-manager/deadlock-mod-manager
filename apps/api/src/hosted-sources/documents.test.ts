import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildHostedSourceCatalog, buildInstallation } from "./documents";
import { examplePack, examplePackSnapshot } from "./fixtures/example-pack/pack";

const snapshot = examplePackSnapshot;
const addon = (pak: string) => `game/citadel/addons/${pak}_dir.vpk`;
const optional = (pak: string) => `game/citadel/optional-addons/${pak}_dir.vpk`;

describe("hosted source documents", () => {
  it("suggests the addons folder, one variant per choice and no extras, in pak order", () => {
    const installation = buildInstallation(examplePack, snapshot);

    expect(installation.requiredComponents).toEqual([]);
    expect(installation.choiceGroups).toEqual([
      {
        id: "folder:game/citadel/addons",
        label: "Pack mods",
        minSelections: 0,
        maxSelections: 1,
        componentIds: [addon("pak01")],
        defaultComponentIds: [addon("pak01")],
      },
      {
        id: "effects",
        label: "Effects",
        minSelections: 0,
        maxSelections: 1,
        componentIds: [addon("pak02"), optional("pak02")],
        defaultComponentIds: [addon("pak02")],
      },
      {
        id: "outlines",
        label: "Outlines",
        minSelections: 0,
        maxSelections: 1,
        componentIds: [addon("pak03"), addon("pak04")],
        defaultComponentIds: [addon("pak03")],
      },
      {
        id: "folder:game/citadel/optional-addons",
        label: "Extras",
        minSelections: 0,
        maxSelections: 1,
        componentIds: [optional("pak05")],
        defaultComponentIds: [],
      },
    ]);
    // Load order: the optional pak02 takes the default pak02's slot.
    expect(installation.components.map((component) => component.id)).toEqual([
      addon("pak01"),
      addon("pak02"),
      optional("pak02"),
      addon("pak03"),
      addon("pak04"),
      optional("pak05"),
    ]);
    expect(installation.components[2]?.label).toBe("Effects (reduced)");
  });

  it("emits the catalog the desktop's integration test validates and installs", () => {
    // `native_sources/integration_fixture_tests.rs` serves this file. After a
    // deliberate change, rewrite it from this snapshot.
    expect(
      buildHostedSourceCatalog([
        { definition: examplePack, snapshot, enabled: true },
      ]),
    ).toEqual(
      JSON.parse(
        readFileSync(
          join(import.meta.dir, "fixtures/example-pack/catalog.json"),
          "utf8",
        ),
      ),
    );
  });

  it("keeps the last snapshot when the archive drops a grouped VPK", () => {
    expect(() =>
      buildInstallation(examplePack, {
        ...snapshot,
        vpkPaths: snapshot.vpkPaths.filter(
          (path) => path !== optional("pak02"),
        ),
      }),
    ).toThrow(/effects/);
  });

  it("marks the listing removed while its flag is off", () => {
    const catalog = buildHostedSourceCatalog([
      { definition: examplePack, snapshot, enabled: false },
    ]);

    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0]?.availability).toBe("removed");
    expect(catalog.items[0]?.release).toBeUndefined();
  });

  it("changes the revision when only the install plan changes", () => {
    // The desktop rejects a release whose plan changes under the same revision.
    const before = buildHostedSourceCatalog([
      { definition: examplePack, snapshot, enabled: true },
    ]);
    const after = buildHostedSourceCatalog([
      { definition: { ...examplePack, groups: [] }, snapshot, enabled: true },
    ]);

    expect(after.items[0]?.release?.contentRevision).not.toBe(
      before.items[0]?.release?.contentRevision,
    );
  });
});
