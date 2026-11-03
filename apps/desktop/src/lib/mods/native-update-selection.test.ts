import { describe, expect, test } from "bun:test";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";
import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";
import type { ModDownloadItem } from "@/types/mods";
import {
  nativeChoicesFit,
  nativeComponentDownloads,
} from "./native-update-selection";
import { selectUpdateDownloads } from "./update-download-selection";

const installation: NativeSourceInstallation = {
  mode: "components",
  requiredComponents: ["base"],
  components: ["base", "red", "blue"].map((id) => ({
    id,
    label: id,
    files: [{ artifactId: "pack", path: `${id}.vpk` }],
  })),
  choiceGroups: [
    {
      id: "color",
      label: "Color",
      componentIds: ["red", "blue"],
      minSelections: 1,
      maxSelections: 1,
      defaultComponentIds: ["blue"],
    },
  ],
};
const source: NativeSourceProvenance = {
  sourceKey: "a".repeat(64),
  sourceId: "example",
  sourceName: "Example",
  acceptedOrigin: "https://example.org",
  descriptorUrl: "https://example.org/source.json",
  listingId: "42",
  releaseId: "r1",
  contentRevision: "1",
  artifactIds: ["pack"],
  componentIds: ["base", "red"],
  iconUrl: null,
};
const artifact = (id: string, name: string): ModDownloadItem => ({
  name,
  url: `dmm-source-file://${source.sourceKey}/42/r2/2/${encodeURIComponent(id)}`,
  size: 0,
  createdAt: null,
  updatedAt: null,
  md5Checksum: null,
});

describe("native update decisions", () => {
  test("keeps component identity when the release moves it into a new archive", () => {
    const moved = {
      ...installation,
      components: installation.components.map((component) => ({
        ...component,
        files: [{ artifactId: "new-pack", path: `${component.id}.vpk` }],
      })),
    };
    const next = artifact("new-pack", "renamed.zip");
    expect(nativeChoicesFit(moved, source.componentIds)).toBe(true);
    expect(
      nativeComponentDownloads(moved, source.componentIds, [next]),
    ).toEqual([next]);
  });
  test("keeps a stable component choice despite a changed default", () => {
    expect(nativeChoicesFit(installation, source.componentIds)).toBe(true);
  });
  test("pauses when a selected component disappears or a required component is added", () => {
    expect(
      nativeChoicesFit(
        {
          ...installation,
          components: installation.components.filter(
            (component) => component.id !== "red",
          ),
        },
        source.componentIds,
      ),
    ).toBe(false);
    expect(
      nativeChoicesFit(
        { ...installation, requiredComponents: ["base", "new-assets"] },
        source.componentIds,
      ),
    ).toBe(false);
  });
  test("pauses for a new required group without silently applying defaults", () => {
    expect(
      nativeChoicesFit(
        {
          ...installation,
          choiceGroups: [
            ...installation.choiceGroups,
            {
              id: "sound",
              label: "Sound",
              componentIds: ["loud", "quiet"],
              minSelections: 1,
              maxSelections: 1,
              defaultComponentIds: ["quiet"],
            },
          ],
        },
        source.componentIds,
      ),
    ).toBe(false);
  });
  test("carries an artifact rename by identity and refuses a different sole artifact", () => {
    const renamed = artifact("pack", "new-name.zip");
    expect(selectUpdateDownloads([renamed], { source })).toEqual([renamed]);
    expect(
      selectUpdateDownloads([artifact("replacement", "old-name.zip")], {
        source,
      }),
    ).toEqual([]);
  });
  test("never silently drops a companion artifact", () => {
    expect(
      selectUpdateDownloads([artifact("pack", "pack.zip")], {
        source: { ...source, artifactIds: ["pack", "audio"] },
      }),
    ).toEqual([]);
  });
});
