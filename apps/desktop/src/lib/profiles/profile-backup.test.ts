import { describe, expect, it } from "bun:test";
import {
  profileBackupPayloadSchema,
  type ProfileBackupSummary,
} from "@deadlock-mods/shared";
import { modFor } from "@/lib/store/slices/profiles.test-support";
import type { ModProfileEntry } from "@/types/profiles";
import {
  buildProfileBackupPayload,
  getProfileBackupStatus,
  hashProfileBackup,
  profileBackupHashInput,
} from "./profile-backup";

const LOCAL_ID = "local-0f8fad5b-d9cb-469f-a165-70867728950e";

const entry = (remoteId: string, enabled = true): ModProfileEntry => ({
  remoteId,
  enabled,
  lastModified: new Date(0),
});

const entries = (...items: ModProfileEntry[]) =>
  Object.fromEntries(items.map((item) => [item.remoteId, item]));

describe("buildProfileBackupPayload", () => {
  it("leaves local mods out of the restorable profile and counts them", () => {
    const mods = ["10", "20", LOCAL_ID].map((remoteId, index) =>
      Object.assign(modFor(remoteId), { installOrder: 2 - index }),
    );
    const payload = buildProfileBackupPayload(
      {
        enabledMods: entries(entry("10"), entry("20", false), entry(LOCAL_ID)),
      },
      mods,
    );

    expect(profileBackupPayloadSchema.parse(payload)).toEqual(payload);
    expect(payload.profile.payload.mods.map((mod) => mod.remoteId)).toEqual([
      "10",
    ]);
    expect(payload.profile.payload.loadOrder).toEqual(["10"]);
    expect(payload.disabledModCount).toBe(1);
    expect(payload.skippedLocalModCount).toBe(1);
    expect(Object.keys(payload.modNames ?? {})).not.toContain(LOCAL_ID);
  });
});

describe("hashProfileBackup", () => {
  it("ignores the order mods were toggled in", async () => {
    const mods = ["10", "20", "30"].map(modFor);
    const toggled = buildProfileBackupPayload(
      { enabledMods: entries(entry("30"), entry("10"), entry("20", false)) },
      mods,
    );
    const original = buildProfileBackupPayload(
      { enabledMods: entries(entry("10"), entry("20", false), entry("30")) },
      mods,
    );

    expect(
      await hashProfileBackup(profileBackupHashInput("Ranked", toggled)),
    ).toBe(await hashProfileBackup(profileBackupHashInput("Ranked", original)));
    expect(
      await hashProfileBackup(profileBackupHashInput("Renamed", original)),
    ).not.toBe(
      await hashProfileBackup(profileBackupHashInput("Ranked", original)),
    );
  });
});

describe("getProfileBackupStatus", () => {
  const backup: ProfileBackupSummary = {
    id: "profile_backup_1",
    name: "Ranked",
    deviceName: "GAMING-PC",
    modCount: 2,
    skippedLocalModCount: 0,
    contentHash: "abc",
    revision: 3,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const backups = new Map([[backup.id, backup]]);
  const link = { backupId: backup.id, revision: 3 };

  it("treats a link to a backup the account no longer has as not backed up", () => {
    expect(getProfileBackupStatus(link, new Map(), "abc")).toEqual({
      kind: "none",
    });
  });

  it("compares the profile's current hash with the backup", () => {
    expect(getProfileBackupStatus(link, backups, "abc").kind).toBe("upToDate");
    expect(getProfileBackupStatus(link, backups, "def").kind).toBe("changed");
  });
});
