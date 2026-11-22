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
import { type LocalMod, ModStatus } from "@/types/mods";
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
const purged: string[] = [];
const actualGuard = await import("@/lib/game-guard");
mock.module("@/lib/game-guard", () => ({
  ...actualGuard,
  invokeGuarded: async (command: string, args: { modId: string }) => {
    if (command !== "purge_mod") throw new Error(`Unexpected ${command}`);
    purged.push(args.modId);
  },
}));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {} },
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

const modFor = (remoteId: string): LocalMod => ({
  id: remoteId,
  remoteId,
  name: remoteId,
  description: null,
  remoteUrl: "",
  category: "Skins",
  likes: 0,
  author: "Author",
  modAuthorId: null,
  downloadable: true,
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  metadata: null,
  dependencies: null,
  overrides: null,
  createdAt: null,
  updatedAt: null,
  status: ModStatus.Installed,
  installedVpks: [`${remoteId}.vpk`],
});

const runRestore = async (input: Input) => {
  const Probe = () => {
    useRestoreProfileBackup();
    return null;
  };
  captured.length = 0;
  renderToStaticMarkup(<Probe />);
  const mutationFn = captured[0]?.mutationFn;
  if (!mutationFn) throw new Error("No mutation captured");
  return mutationFn(input, {
    client: new reactQuery.QueryClient(),
    meta: undefined,
  });
};

describe("useRestoreProfileBackup", () => {
  it("links the profile it restored into and returns the outcome", async () => {
    const restored = await runRestore({
      backup,
      profile: backup.payload.profile,
      modsData: [],
      destination: "replace",
    });

    expect(restored).toBe(outcome);
    const links = usePersistedStore.getState().cloudBackupLinks;
    expect(links[target]).toEqual({ backupId: "backup-1", revision: 3 });
    expect(links[other]).toBeUndefined();
  });

  it("removes the profile's mods that aren't in the backup on replace", async () => {
    const local = "local-0b0e8c7a-1d2f-4a3b-9c4d-5e6f7a8b9c0d";
    const foundOnDisk = "local-ext-aceb87e2f1c990c42517d2";
    const kept = ["1", local, foundOnDisk];
    usePersistedStore.getState().upsertProfile({
      id: target,
      name: "Target",
      createdAt: new Date(),
      enabledMods: Object.fromEntries(
        ["1", "3", local, foundOnDisk].map((remoteId) => [
          remoteId,
          { remoteId, enabled: true, lastModified: new Date() },
        ]),
      ),
      isDefault: false,
      folderName: "profile_target",
      mods: ["1", "3", local, foundOnDisk].map(modFor),
    });
    const withMod = profileBackupSchema.parse({
      ...backup,
      payload: {
        ...backup.payload,
        profile: {
          version: "3",
          payload: {
            mods: [{ remoteId: "1", submissionType: "mod" }],
            loadOrder: [],
          },
        },
      },
    });

    await runRestore({
      backup: withMod,
      profile: withMod.payload.profile,
      modsData: [],
      destination: "replace",
    });

    expect(purged).toEqual(["3"]);
    const restored = usePersistedStore.getState().profiles[target];
    expect(restored?.mods.map((mod) => mod.remoteId)).toEqual(kept);
    expect(Object.keys(restored?.enabledMods ?? {})).toEqual(kept);
  });
});
