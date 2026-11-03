import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  profileSchema,
  type ModDto,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { createInstance } from "i18next";
import en from "@/locales/en.json";
import type { InstalledModInfo, ProfileImportResult } from "@/types/mods";
import { createProfileId, type ModProfile } from "@/types/profiles";

interface ToastCall {
  kind: "success" | "warning" | "error";
  title: string;
  description?: string;
}

const toasts: ToastCall[] = [];
const warnings: string[] = [];
const applied: string[][] = [];
// Mods whose download list can't be fetched, and the batch's answer.
let unpreparable = new Set<string>();
let batch: (ids: string[]) => Promise<ProfileImportResult> = async () => ({
  profileFolder: "folder",
  succeeded: [],
  failed: [],
  installedMods: [],
});

mock.module("@/lib/analytics", () => ({
  analytics: { start: () => ({ finish: () => false }) },
  captureMilestone: () => {},
}));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
// The saved log file keeps a line's message but not its metadata.
const log = {
  withMetadata: () => log,
  withError: () => log,
  info: () => {},
  warn: (message: string) => warnings.push(message),
  error: () => {},
};
mock.module("@/lib/logger", () => ({ default: log, createLogger: () => log }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: {
    success: (title: string) => toasts.push({ kind: "success", title }),
    error: (title: string) => toasts.push({ kind: "error", title }),
    warning: (title: string, options?: { description?: string }) =>
      toasts.push({
        kind: "warning",
        title,
        description: options?.description,
      }),
  },
}));
const apiClient = await import("@/lib/api-client");
mock.module("@/lib/api-client", () => ({
  ...apiClient,
  getModDownloads: async (remoteId: string) => {
    if (unpreparable.has(remoteId)) throw new Error("catalog timeout");
    return {
      downloads: [
        {
          name: `${remoteId}.zip`,
          url: `https://gamebanana.com/dl/${remoteId}`,
          size: 1,
          md5Checksum: null,
          createdAt: null,
          updatedAt: null,
        },
      ],
      count: 1,
    };
  },
}));
mock.module("@/lib/game-guard", () => ({
  invokeGuarded: (_command: string, args: { mods: { modId: string }[] }) =>
    batch(args.mods.map((mod) => mod.modId)),
}));

const { createProfileImportFlow } = await import("./import-profile");

const i18n = createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const modDto = (remoteId: string, name: string): ModDto => {
  const now = new Date(0);
  return {
    id: remoteId,
    remoteId,
    name,
    description: "",
    remoteUrl: `https://gamebanana.com/mods/${remoteId}`,
    category: "Skins",
    likes: 0,
    author: "Friend",
    modAuthorId: null,
    downloadable: true,
    remoteAddedAt: now,
    remoteUpdatedAt: now,
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
    createdAt: now,
    updatedAt: now,
  };
};

const sharedProfile = (ids: string[]): SharedProfile =>
  profileSchema.parse({
    version: "3",
    payload: {
      mods: ids.map((remoteId) => ({ remoteId, submissionType: "mod" })),
      loadOrder: ids,
    },
  });

const installed = (modId: string): InstalledModInfo => ({
  modId,
  modName: modId,
  installedVpks: [`pak01_dir.vpk`],
});

/** Installs `ok`, fails `failed` in the batch with a raw backend error. */
const batchResult =
  (ok: string[], failed: string[]) =>
  async (ids: string[]): Promise<ProfileImportResult> => ({
    profileFolder: "folder",
    succeeded: ids.filter((id) => ok.includes(id)),
    failed: ids
      .filter((id) => failed.includes(id))
      .map((id): [string, string] => [id, "ModFileNotFound"]),
    installedMods: ids.filter((id) => ok.includes(id)).map(installed),
  });

const activeProfile: ModProfile = {
  id: createProfileId("active"),
  name: "Active",
  createdAt: new Date(0),
  enabledMods: {},
  isDefault: false,
  folderName: "active-folder",
  mods: [],
};

const flow = () =>
  createProfileImportFlow({
    setImportProgress: () => {},
    t: i18n.t,
    upsertProfile: () => {},
    createImportProfileFolder: async () => "folder",
    applyImportInstalledModsToProfile: (_profileId, installedMods) => {
      applied.push(installedMods.map((mod) => mod.modId));
    },
    setProfileFolderName: () => {},
    getProfile: () => activeProfile,
    getActiveProfile: () => activeProfile,
    fileserverPreference: "default",
  });

// Four mods: Alpha installs, 2 isn't in the catalog, Charlie's downloads
// can't be fetched, Delta fails in the batch.
const mixed = () => {
  unpreparable = new Set(["3"]);
  batch = batchResult(["1"], ["4"]);
  return {
    profile: sharedProfile(["1", "2", "3", "4"]),
    modsData: [
      modDto("1", "Alpha"),
      modDto("3", "Charlie"),
      modDto("4", "Delta"),
    ],
  };
};

const destinations = {
  "a new profile": async (profile: SharedProfile, modsData: ModDto[]) => {
    await flow().createProfileFromImport(profile, modsData);
  },
  "the current profile": (profile: SharedProfile, modsData: ModDto[]) =>
    flow().addToCurrentProfile(profile, modsData),
};

beforeEach(() => {
  toasts.length = 0;
  warnings.length = 0;
  applied.length = 0;
  unpreparable = new Set();
});

describe("profile import completion", () => {
  for (const [destination, run] of Object.entries(destinations)) {
    it(`names each mod that failed to import into ${destination}`, async () => {
      const { profile, modsData } = mixed();

      await run(profile, modsData);

      expect(applied).toEqual([["1"]]);
      expect(toasts).toHaveLength(1);
      const [toast] = toasts;
      expect(toast?.kind).toBe("warning");
      expect(toast?.title).toContain("1/4 mods imported");
      expect(toast?.description?.split("\n")).toEqual([
        "Mod 2: Could not get the mod's details",
        "Charlie: Could not get its downloads",
        "Delta: Download or install failed",
      ]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEndWith(
        ": 2 (lookup), 3 (downloads: catalog timeout), 4 (install: ModFileNotFound)",
      );
    });
  }

  it("lists five failures and counts the rest", async () => {
    const ids = ["1", "2", "3", "4", "5", "6", "7"];
    batch = batchResult(["1"], ids.slice(1));

    await flow().createProfileFromImport(
      sharedProfile(ids),
      ids.map((id) => modDto(id, `Mod ${id} name`)),
    );

    const lines = toasts[0]?.description?.split("\n");
    expect(lines).toEqual([
      "Mod 2 name: Download or install failed",
      "Mod 3 name: Download or install failed",
      "Mod 4 name: Download or install failed",
      "Mod 5 name: Download or install failed",
      "Mod 6 name: Download or install failed",
      "and 1 more",
    ]);
  });

  it("reports an import where nothing installed", async () => {
    unpreparable = new Set(["1", "2"]);

    await flow().createProfileFromImport(sharedProfile(["1", "2"]), [
      modDto("1", "Alpha"),
      modDto("2", "Bravo"),
    ]);

    expect(applied).toEqual([]);
    expect(toasts[0]?.kind).toBe("warning");
    expect(toasts[0]?.title).toContain("0/2 mods imported");
    expect(toasts[0]?.description?.split("\n")).toEqual([
      "Alpha: Could not get its downloads",
      "Bravo: Could not get its downloads",
    ]);
  });

  it("falls back to the ID for a mod with a blank name", async () => {
    batch = batchResult([], ["1"]);

    await flow().createProfileFromImport(sharedProfile(["1"]), [
      modDto("1", "  "),
    ]);

    expect(toasts[0]?.description).toBe("Mod 1: Download or install failed");
  });

  it("keeps the plain success toast when every mod installs", async () => {
    batch = batchResult(["1", "2"], []);

    await flow().createProfileFromImport(sharedProfile(["1", "2"]), [
      modDto("1", "Alpha"),
      modDto("2", "Bravo"),
    ]);

    expect(toasts).toEqual([
      { kind: "success", title: expect.stringContaining("created") },
    ]);
  });

  it("keeps the error path when the batch command itself fails", async () => {
    batch = async () => {
      throw new Error("game is running");
    };

    await expect(
      flow().createProfileFromImport(sharedProfile(["1"]), [
        modDto("1", "Alpha"),
      ]),
    ).rejects.toThrow("game is running");

    expect(toasts.map((toast) => toast.kind)).toEqual(["error"]);
  });
});
