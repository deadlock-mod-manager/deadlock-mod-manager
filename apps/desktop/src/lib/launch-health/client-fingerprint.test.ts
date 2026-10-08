import { describe, expect, it } from "bun:test";
import { ModStatus } from "@/types/mods";
import { createProfileId } from "@/types/profiles";
import { buildClientFingerprint } from "./client-fingerprint";

const profile = {
  id: createProfileId("default"),
  name: "Default Profile",
  enabledMods: {
    a: { lastModified: new Date("2026-10-08T09:00:00Z") },
  },
};

describe("buildClientFingerprint", () => {
  it("lists installed mods enabled in the profile", () => {
    const fingerprint = buildClientFingerprint(
      profile,
      [
        {
          remoteId: "a",
          name: "Mod a",
          status: ModStatus.Installed,
          downloadedAt: new Date("2026-10-01T10:00:00Z"),
          activeVariantArchive: "blue.zip",
        },
        { remoteId: "b", name: "Mod b", status: ModStatus.Installed },
        { remoteId: "c", name: "Mod c", status: ModStatus.Downloaded },
      ],
      (remoteId) => remoteId !== "b",
    );

    expect(fingerprint).toEqual({
      profileId: "default",
      profileName: "Default Profile",
      mods: [
        {
          remoteId: "a",
          name: "Mod a",
          downloadedAt: "2026-10-01T10:00:00.000Z",
          variant: "blue.zip",
          enabledAt: "2026-10-08T09:00:00.000Z",
        },
      ],
    });
  });

  it("accepts dates that came back from storage as strings", () => {
    const fingerprint = buildClientFingerprint(
      { ...profile, enabledMods: { a: { lastModified: "not a date" } } },
      [
        {
          remoteId: "a",
          name: "Mod a",
          status: ModStatus.Installed,
          downloadedAt: "2026-10-01T10:00:00.000Z",
        },
      ],
      () => true,
    );

    expect(fingerprint?.mods).toEqual([
      {
        remoteId: "a",
        name: "Mod a",
        downloadedAt: "2026-10-01T10:00:00.000Z",
        variant: null,
        enabledAt: null,
      },
    ]);
  });

  it("needs an active profile", () => {
    expect(buildClientFingerprint(undefined, [], () => true)).toBeNull();
  });
});
