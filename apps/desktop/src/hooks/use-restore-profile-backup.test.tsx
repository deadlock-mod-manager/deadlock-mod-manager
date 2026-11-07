import { describe, expect, it, mock } from "bun:test";
import {
  type ModDto,
  type ProfileBackup,
  profileBackupSchema,
  type SharedProfile,
} from "@deadlock-mods/shared";
import type { UseMutationOptions } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileImportOutcome } from "@/lib/profiles/types";
import { createProfileId } from "@/types/profiles";
import type { RestoreDestination } from "./use-restore-profile-backup";

interface Input {
  backup: ProfileBackup;
  profile: SharedProfile;
  modsData: ModDto[];
  destination: RestoreDestination;
}
type Options = UseMutationOptions<ProfileImportOutcome, Error, Input>;

const captured: Options[] = [];
const target = createProfileId("restore-target");
const other = createProfileId("switched-to");
const outcome: ProfileImportOutcome = {
  profileId: target,
  profileName: "Target",
  importedCount: 1,
  totalCount: 2,
  failures: [{ remoteId: "2", name: null, step: "lookup", error: null }],
};

const reactQuery = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
  ...reactQuery,
  useMutation: (options: Options) => {
    captured.push(options);
    return {};
  },
  useQueryClient: () => ({}),
}));
mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@/hooks/use-profile-import", () => ({
  useProfileImport: () => ({
    importProgress: null,
    createProfileFromImport: async () => outcome,
    // The user switches profile while the restore installs.
    addToCurrentProfile: async () => {
      usePersistedStore.setState({ activeProfileId: other });
      return outcome;
    },
  }),
}));

const { usePersistedStore } = await import("@/lib/store");
const { useRestoreProfileBackup } =
  await import("./use-restore-profile-backup");

const backup = profileBackupSchema.parse({
  id: "backup-1",
  name: "Target",
  deviceName: "PC",
  modCount: 2,
  skippedLocalModCount: 0,
  contentHash: "hash",
  revision: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  payload: {
    version: "1",
    profile: { version: "3", payload: { mods: [], loadOrder: [] } },
    modGroups: [],
    skippedLocalModCount: 0,
  },
});

describe("useRestoreProfileBackup", () => {
  it("links the profile it restored into and returns the outcome", async () => {
    const Probe = () => {
      useRestoreProfileBackup();
      return null;
    };
    renderToStaticMarkup(<Probe />);
    const mutationFn = captured[0]?.mutationFn;
    expect(mutationFn).toBeDefined();
    if (!mutationFn) return;

    const restored = await mutationFn(
      {
        backup,
        profile: backup.payload.profile,
        modsData: [],
        destination: "replace",
      },
      { client: new reactQuery.QueryClient(), meta: undefined },
    );

    expect(restored).toBe(outcome);
    const links = usePersistedStore.getState().cloudBackupLinks;
    expect(links[target]).toEqual({ backupId: "backup-1", revision: 3 });
    expect(links[other]).toBeUndefined();
  });
});
