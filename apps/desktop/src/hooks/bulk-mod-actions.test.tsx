import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import { type LocalMod, ModStatus } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";

const testLogger = {
  withMetadata() {
    return this;
  },
  withError() {
    return this;
  },
  errorOnly() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};
mock.module("@/lib/logger", () => ({
  createLogger: () => testLogger,
  default: testLogger,
}));
mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));
mock.module("@/components/providers/alert-dialog", () => ({
  useConfirm: () => async () => true,
}));

type GuardedCall = { command: string; modId: string };
const guardedCalls: GuardedCall[] = [];
let failingModId: string | null = null;
const failure: ErrorKind = {
  kind: "modInvalid",
  message:
    "Cannot disable mod because original VPK name count (2) does not match installed VPK count (1)",
};
mock.module("@/lib/game-guard", () => ({
  invokeGuarded: async (
    command: string,
    args: { modId: string },
  ): Promise<void> => {
    guardedCalls.push({ command, modId: args.modId });
    if (args.modId === failingModId) throw failure;
  },
}));
const discarded: string[] = [];
let failingDiscardId: string | null = null;
mock.module("@/lib/download/manager", () => ({
  downloadManager: {
    discardDownload: async (remoteId: string) => {
      discarded.push(remoteId);
      if (remoteId === failingDiscardId) throw new Error("download is busy");
    },
    isQueued: () => false,
  },
}));

const { useDisableAllMods } = await import("./use-disable-all-mods");
const { useDeleteMods } = await import("./use-delete-mods");
const { usePersistedStore } = await import("@/lib/store");

const IDS = ["mod-a", "mod-b", "mod-c"];
// Server rendering reads the store's initial state, not its current one, so the
// probe would see an empty library. Seed that object too, and put it back after.
const initialState = usePersistedStore.getInitialState();
const pristine = {
  localMods: initialState.localMods,
  profiles: initialState.profiles,
};

const installedMod = (remoteId: string, index: number): LocalMod => {
  const vpk = `pak0${index + 1}_dir.vpk`;
  return {
    ...placeholderModFromManifest(
      remoteId,
      {
        enabled: true,
        shard: 1,
        currentVpks: [vpk],
        disabledVpks: [],
        originalVpkNames: [`${remoteId}.vpk`],
      },
      [vpk],
    ),
    name: `Mod ${remoteId}`,
    status: ModStatus.Installed,
  };
};

const seedLibrary = () => {
  const state = usePersistedStore.getState();
  const profileId = state.activeProfileId;
  const profile = state.profiles[profileId];
  if (!profile) throw new Error("Active profile is missing from the store");
  const mods = IDS.map(installedMod);
  usePersistedStore.setState({
    localMods: mods,
    profiles: {
      ...state.profiles,
      [profileId]: {
        ...profile,
        mods,
        enabledMods: Object.fromEntries(
          IDS.map((remoteId) => [
            remoteId,
            { remoteId, enabled: true, lastModified: new Date(0) },
          ]),
        ),
      },
    },
  });
};

/**
 * Renders the hook once and returns the mutation callback it exposes. Calling
 * it runs the hook's real React Query mutation against `client`.
 */
const captureCallback = async <T,>(
  client: QueryClient,
  useCallback: () => T,
): Promise<T> => {
  const captured: T[] = [];
  const Probe = () => {
    captured.push(useCallback());
    return null;
  };
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <Probe />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  const [callback] = captured;
  if (callback === undefined) throw new Error("The hook never rendered");
  return callback;
};

const settledMutation = async (client: QueryClient) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [mutation] = client.getMutationCache().getAll();
    if (
      mutation &&
      (mutation.state.status === "success" || mutation.state.status === "error")
    )
      return mutation;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The bulk mutation never settled");
};

const modIds = (mods: readonly { remoteId: string }[] | undefined) =>
  mods?.map((mod) => mod.remoteId);

const statusOf = (remoteId: string) =>
  usePersistedStore
    .getState()
    .localMods.find((mod) => mod.remoteId === remoteId)?.status;

beforeEach(() => {
  guardedCalls.length = 0;
  discarded.length = 0;
  failingModId = "mod-b";
  failingDiscardId = null;
  seedLibrary();
  const { localMods, profiles } = usePersistedStore.getState();
  Object.assign(initialState, { localMods, profiles });
});

afterEach(() => {
  Object.assign(initialState, pristine);
  usePersistedStore.setState(pristine);
});

describe("bulk disable and delete stopped by a failure", () => {
  it("reports which mods were disabled, which failed and which were not attempted", async () => {
    const client = new QueryClient();
    const disableAll = (
      await captureCallback(client, () => useDisableAllMods())
    ).disableAll;

    disableAll(new Set(IDS));
    const mutation = await settledMutation(client);

    expect(guardedCalls).toEqual([
      { command: "uninstall_mod", modId: "mod-a" },
      { command: "uninstall_mod", modId: "mod-b" },
    ]);
    expect(IDS.map(statusOf)).toEqual([
      ModStatus.Downloaded,
      ModStatus.Installed,
      ModStatus.Installed,
    ]);
    expect(mutation.state.status).toBe("success");
    expect(mutation.state.data).toMatchObject({
      action: "disable",
      stoppedBy: "error",
      completed: [{ remoteId: "mod-a" }],
      failed: { mod: { remoteId: "mod-b" }, message: failure.message },
      notAttempted: [{ remoteId: "mod-c" }],
    });
  });

  it("reports which mods were deleted, which failed and which were not attempted", async () => {
    const client = new QueryClient();
    const deleteMods = (await captureCallback(client, () => useDeleteMods()))
      .deleteMods;

    deleteMods(new Set(IDS));
    const mutation = await settledMutation(client);

    expect(guardedCalls).toEqual([
      { command: "purge_mod", modId: "mod-a" },
      { command: "purge_mod", modId: "mod-b" },
    ]);
    expect(discarded).toEqual(["mod-a", "mod-b"]);
    expect(modIds(usePersistedStore.getState().localMods)).toEqual([
      "mod-b",
      "mod-c",
    ]);
    expect(mutation.state.status).toBe("success");
    expect(mutation.state.data).toMatchObject({
      action: "delete",
      stoppedBy: "error",
      completed: [{ remoteId: "mod-a" }],
      failed: { mod: { remoteId: "mod-b" }, message: failure.message },
      notAttempted: [{ remoteId: "mod-c" }],
    });
  });

  it("treats a failed download cancellation as that mod's delete failing", async () => {
    failingModId = null;
    failingDiscardId = "mod-b";
    const client = new QueryClient();
    const deleteMods = (await captureCallback(client, () => useDeleteMods()))
      .deleteMods;

    deleteMods(new Set(IDS));
    const mutation = await settledMutation(client);

    expect(discarded).toEqual(["mod-a", "mod-b"]);
    expect(guardedCalls).toEqual([{ command: "purge_mod", modId: "mod-a" }]);
    expect(mutation.state.data).toMatchObject({
      action: "delete",
      stoppedBy: "error",
      completed: [{ remoteId: "mod-a" }],
      failed: { mod: { remoteId: "mod-b" }, message: "download is busy" },
      notAttempted: [{ remoteId: "mod-c" }],
    });
  });
});

describe("bulk disable and delete that finish", () => {
  it("disable reports every mod as done and nothing stopped", async () => {
    failingModId = null;
    const client = new QueryClient();
    const disableAll = (
      await captureCallback(client, () => useDisableAllMods())
    ).disableAll;

    disableAll(new Set(IDS));
    const mutation = await settledMutation(client);

    expect(IDS.map(statusOf)).toEqual([
      ModStatus.Downloaded,
      ModStatus.Downloaded,
      ModStatus.Downloaded,
    ]);
    expect(mutation.state.data).toMatchObject({
      stoppedBy: null,
      failed: null,
      notAttempted: [],
      completed: IDS.map((remoteId) => ({ remoteId })),
    });
  });

  it("delete reports every mod as done and nothing stopped", async () => {
    failingModId = null;
    const client = new QueryClient();
    const deleteMods = (await captureCallback(client, () => useDeleteMods()))
      .deleteMods;

    deleteMods(new Set(IDS));
    const mutation = await settledMutation(client);

    expect(usePersistedStore.getState().localMods).toEqual([]);
    expect(mutation.state.data).toMatchObject({
      stoppedBy: null,
      failed: null,
      notAttempted: [],
      completed: IDS.map((remoteId) => ({ remoteId })),
    });
  });
});
