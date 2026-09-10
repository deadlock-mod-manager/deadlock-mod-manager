import { mock } from "bun:test";

import type { ModDto } from "@deadlock-mods/shared";
import { ModStatus, type LocalMod } from "@/types/mods";
import { type ProfileVpkSnapshot } from "@/types/profiles";

const loggerMock = {
  withMetadata() {
    return this;
  },
  withError() {
    return this;
  },
  info() {},
  warn() {},
  error() {},
};
mock.module("@/lib/logger", () => ({ default: loggerMock }));

export const modFor = (remoteId: string): LocalMod => ({
  id: remoteId,
  remoteId,
  name: `Mod ${remoteId}`,
  description: null,
  remoteUrl: `https://gamebanana.com/mods/${remoteId}`,
  category: "Skins",
  likes: 0,
  author: "Fixture",
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
  status: ModStatus.Downloaded,
});

export const snapshotFor = (
  modId = "42",
  fileShard = 1,
): ProfileVpkSnapshot => ({
  manifest: {
    version: 3,
    mods: {
      [modId]: {
        enabled: true,
        shard: 1,
        currentVpks: ["pak01_dir.vpk"],
        disabledVpks: [],
        originalVpkNames: ["original.vpk"],
        order: 0,
      },
    },
  },
  files: [
    { shard: fileShard, filename: "pak01_dir.vpk", locator: "pak01_dir.vpk" },
  ],
});

export const profileTestBackend: {
  readSnapshot: (folder: string | null) => Promise<ProfileVpkSnapshot>;
  readMetadata: (id: string) => Promise<ModDto>;
} = {
  readSnapshot: async () => snapshotFor(),
  readMetadata: async (id) => modFor(id),
};
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args?: { profileFolder?: string | null }) => {
    if (command === "get_profile_vpk_snapshot")
      return profileTestBackend.readSnapshot(args?.profileFolder ?? null);
    return undefined;
  },
}));
mock.module("@/lib/api-client", () => ({
  getMod: (id: string) => profileTestBackend.readMetadata(id),
}));
