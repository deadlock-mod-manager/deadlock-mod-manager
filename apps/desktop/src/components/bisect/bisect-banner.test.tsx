import { beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InstallWithCollectionFunction } from "@/hooks/use-install-with-collection";
import { createBisect } from "@/lib/bisect/search";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import { ModStatus } from "@/types/mods";
import type { ProfileVpkSnapshot } from "@/types/profiles";
import type { ErrorKind } from "@/types/tauri";

const noop = () => undefined;
const logger = {
  withMetadata() {
    return this;
  },
  withError() {
    return this;
  },
  warn: noop,
  error: noop,
  info: noop,
  debug: noop,
  trace: noop,
};
const failMissing: InstallWithCollectionFunction = async (mod, options) => {
  options.onStart(mod);
  options.onError(mod, {
    kind: "modFileNotFound",
    message: "Mod file not found at path",
  });
  return null;
};
const install = mock<InstallWithCollectionFunction>(failMissing);
const invokeGuarded = mock(async (): Promise<Array<[string, string[]]>> => []);
const confirm = mock(async () => true);
const toastError = mock(noop);
const translate = mock((key: string) => key);
const memory = new Map<string, string>();
const backingStore = {
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: string) => {
    memory.set(key, value);
  },
  delete: async (key: string) => {
    memory.delete(key);
  },
  save: async () => {},
};
const emptySnapshot = (): ProfileVpkSnapshot => ({
  manifest: { version: 1, mods: {} },
  files: [],
  missing: [],
});
const getSnapshot = mock(async () => emptySnapshot());
const buttons = new Map<
  string,
  { click: () => void | Promise<void>; disabled: boolean }
>();

mock.module("@/lib/logger", () => ({
  default: logger,
  createLogger: () => logger,
}));
mock.module("@tauri-apps/plugin-store", () => ({
  getStore: async () => backingStore,
}));
mock.module("@/lib/tauri-commands", () => ({
  getProfileVpkSnapshot: getSnapshot,
}));
mock.module("@/lib/analytics", () => ({ analytics: { track: noop } }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: noop, error: toastError, warning: noop },
}));
mock.module("@/hooks/use-install-with-collection", () => ({
  default: () => ({ install }),
}));
mock.module("@/hooks/use-launch", () => ({
  useLaunch: () => ({ launch: noop }),
}));
mock.module("@/lib/game-guard", () => ({
  invokeGuarded,
  isGameRunningError: () => false,
}));
mock.module("@/components/providers/alert-dialog", () => ({
  useConfirm: () => confirm,
}));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
    onClick = noop,
    disabled = false,
  }: {
    children?: ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
  }) => {
    const label = Children.toArray(children)
      .filter((child) => !isValidElement(child))
      .join("");
    buttons.set(label, { click: onClick, disabled });
    return <button disabled={disabled}>{children}</button>;
  },
}));

const { usePersistedStore } = await import("@/lib/store");
const { BisectBanner } = await import("./bisect-banner");
const { __resetForTests: resetStorage, flushPendingWrites } =
  await import("@/lib/store/storage");

const renderBanner = (client: QueryClient) => {
  const session = usePersistedStore.getState().bisectSession;
  if (!session) throw new Error("Expected a search session");
  buttons.clear();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <BisectBanner session={session} onShowResult={noop} />
    </QueryClientProvider>,
  );
};

const waitForActions = async (client: QueryClient) => {
  if (!client.isMutating()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = client.getMutationCache().subscribe(() => {
      if (!client.isMutating()) {
        unsubscribe();
        resolve();
      }
    });
  });
};

const restartStore = async () => {
  await flushPendingWrites();
  resetStorage();
  usePersistedStore.setState(usePersistedStore.getInitialState(), true);
  await usePersistedStore.persist.rehydrate();
};

const addHealthyMod = (id: string) => {
  const state = usePersistedStore.getState();
  const first = state.localMods[0];
  const profile = state.getActiveProfile();
  const session = state.bisectSession;
  if (!first || !profile || !session)
    throw new Error("Expected a recovery fixture");
  const mod = {
    ...first,
    remoteId: id,
    id,
    name: id,
    status: ModStatus.Downloaded,
  };
  const mods = [...state.localMods, mod];
  usePersistedStore.setState({
    localMods: mods,
    profiles: { [profile.id]: { ...profile, mods } },
    bisectSession: {
      ...session,
      candidates: [...session.candidates, id],
      originalEnabled: [...session.originalEnabled, id],
      loadOrder: [...session.loadOrder, id],
    },
  });
  return mod;
};

describe("broken mod search recovery", () => {
  beforeEach(async () => {
    await flushPendingWrites();
    resetStorage();
    memory.clear();
    usePersistedStore.setState(usePersistedStore.getInitialState(), true);
    await usePersistedStore.persist.rehydrate();
    install.mockReset();
    install.mockImplementation(failMissing);
    invokeGuarded.mockClear();
    confirm.mockClear();
    toastError.mockClear();
    translate.mockClear();
    getSnapshot.mockReset();
    getSnapshot.mockResolvedValue(emptySnapshot());
    const state = usePersistedStore.getState();
    const mod = placeholderModFromManifest(
      "snd-82623",
      {
        enabled: false,
        order: 0,
        shard: 0,
        currentVpks: [],
        disabledVpks: [],
        originalVpkNames: [],
      },
      [],
    );
    mod.name = "McGinnis' Old Minigun!";
    const profile = state.getActiveProfile();
    if (!profile) throw new Error("Expected the default profile");
    usePersistedStore.setState({
      localMods: [mod],
      profiles: { [profile.id]: { ...profile, mods: [mod] } },
      bisectSession: {
        version: 1,
        profileId: state.activeProfileId,
        startedAt: new Date(0).toISOString(),
        originalEnabled: [mod.remoteId],
        loadOrder: [mod.remoteId],
        candidates: [mod.remoteId],
        algo: createBisect([mod.remoteId]),
        config: [],
        round: 1,
        stage: "restoring",
        crashDetected: false,
        culprits: null,
        disableOnFinish: [],
        history: [],
      },
    });
  });

  it("lets the user discard a search after restoring missing mod files fails", async () => {
    const client = new QueryClient();
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    await waitForActions(client);
    expect(install).toHaveBeenCalledTimes(1);
    expect(usePersistedStore.getState().bisectSession?.stage).toBe("restoring");
    expect(translate).toHaveBeenCalledWith("bisect.toasts.restoreIncomplete", {
      names: "McGinnis' Old Minigun!",
    });

    const before = usePersistedStore.getState();
    renderBanner(client);
    const discard = buttons.get("bisect.banner.discard");
    expect(
      discard,
      "failed restoration must offer a way to unlock the library",
    ).toBeDefined();
    if (!discard) throw new Error("Discard button is missing");
    await discard.click();
    await waitForActions(client);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(usePersistedStore.getState().bisectSession).toBeNull();
    expect(usePersistedStore.getState().localMods).toBe(before.localMods);
    expect(usePersistedStore.getState().profiles).toBe(before.profiles);
    expect(install).toHaveBeenCalledTimes(1);
    expect(invokeGuarded).not.toHaveBeenCalled();
    client.clear();
  });

  it("keeps discard cleared after reloading saved state", async () => {
    const client = new QueryClient();
    await restartStore();
    expect(usePersistedStore.getState().bisectSession?.stage).toBe("restoring");
    renderBanner(client);
    const discard = buttons.get("bisect.banner.discard");
    if (!discard) throw new Error("Discard button is missing");
    await discard.click();
    await waitForActions(client);
    await restartStore();
    const state = usePersistedStore.getState();
    expect(state.bisectSession).toBeNull();
    expect(state.localMods.map((mod) => mod.remoteId)).toEqual(["snd-82623"]);
    expect(state.getActiveProfile()?.mods.map((mod) => mod.remoteId)).toEqual([
      "snd-82623",
    ]);
    client.clear();
  });

  it("restores healthy mods after missing files and restores their load order", async () => {
    const client = new QueryClient();
    addHealthyMod("healthy-a");
    addHealthyMod("healthy-b");
    install.mockImplementation(async (mod, options) => {
      options.onStart(mod);
      if (mod.remoteId === "snd-82623") {
        options.onError(mod, {
          kind: "modFileNotFound",
          message: "Missing files",
        });
        return null;
      }
      const installed = {
        id: mod.remoteId,
        name: mod.name,
        installed_vpks: [`${mod.remoteId}.vpk`],
      };
      options.onComplete(mod, installed);
      return installed;
    });
    getSnapshot.mockResolvedValue({
      ...emptySnapshot(),
      manifest: {
        version: 1,
        mods: {
          "healthy-b": {
            enabled: true,
            shard: 0,
            currentVpks: ["pak01_dir.vpk"],
            disabledVpks: [],
            originalVpkNames: [],
          },
          "healthy-a": {
            enabled: true,
            shard: 0,
            currentVpks: ["pak02_dir.vpk"],
            disabledVpks: [],
            originalVpkNames: [],
          },
        },
      },
    });
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    await waitForActions(client);
    expect(install.mock.calls.map(([mod]) => mod.remoteId)).toEqual([
      "snd-82623",
      "healthy-a",
      "healthy-b",
    ]);
    const state = usePersistedStore.getState();
    expect(state.isModEnabledInCurrentProfile("healthy-a")).toBe(true);
    expect(state.isModEnabledInCurrentProfile("healthy-b")).toBe(true);
    expect(state.bisectSession?.stage).toBe("restoring");
    expect(invokeGuarded).toHaveBeenCalledWith("reorder_mods_by_remote_id", {
      modOrderData: [
        ["healthy-a", ["healthy-a.vpk"], 0],
        ["healthy-b", ["healthy-b.vpk"], 1],
      ],
      profileFolder: null,
    });
    expect(translate).toHaveBeenCalledWith("bisect.toasts.restoreIncomplete", {
      names: "McGinnis' Old Minigun!",
    });
    install.mockClear();
    install.mockImplementation(async (mod, options) => {
      options.onStart(mod);
      const installed = {
        id: mod.remoteId,
        name: mod.name,
        installed_vpks: ["pak03_dir.vpk"],
      };
      options.onComplete(mod, installed);
      return installed;
    });
    getSnapshot.mockResolvedValue(emptySnapshot());
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    await waitForActions(client);
    expect(install.mock.calls.map(([mod]) => mod.remoteId)).toEqual([
      "snd-82623",
    ]);
    expect(usePersistedStore.getState().bisectSession).toBeNull();
    client.clear();
  });

  for (const keepHealthy of [true, false]) {
    it(`keeps recovery incomplete when reconciliation removes ${keepHealthy ? "one mod" : "all mods"}`, async () => {
      const client = new QueryClient();
      const healthy = addHealthyMod("healthy");
      const profile = usePersistedStore.getState().getActiveProfile();
      if (!profile) throw new Error("Expected a recovery fixture");
      const mods = keepHealthy ? [healthy] : [];
      usePersistedStore.setState({
        localMods: mods,
        profiles: { [profile.id]: { ...profile, mods } },
      });
      install.mockImplementation(async (mod, options) => {
        options.onStart(mod);
        const installed = {
          id: mod.remoteId,
          name: mod.name,
          installed_vpks: ["pak01_dir.vpk"],
        };
        options.onComplete(mod, installed);
        return installed;
      });
      renderBanner(client);
      buttons.get("bisect.banner.finishRestoring")?.click();
      await waitForActions(client);
      expect(install).toHaveBeenCalledTimes(keepHealthy ? 1 : 0);
      expect(
        usePersistedStore.getState().isModEnabledInCurrentProfile("healthy"),
      ).toBe(keepHealthy);
      expect(usePersistedStore.getState().bisectSession?.stage).toBe(
        "restoring",
      );
      expect(translate).toHaveBeenCalledWith(
        "bisect.toasts.restoreIncomplete",
        { names: keepHealthy ? "snd-82623" : "snd-82623, healthy" },
      );
      client.clear();
    });
  }

  it("stops a diagnostic round when its candidate disappeared from the library", async () => {
    const client = new QueryClient();
    const state = usePersistedStore.getState();
    const profile = state.getActiveProfile();
    if (!profile) throw new Error("Expected a recovery fixture");
    usePersistedStore.setState({
      localMods: [],
      profiles: { [profile.id]: { ...profile, mods: [] } },
    });
    state.updateBisectSession({ stage: "applying", config: ["snd-82623"] });
    renderBanner(client);
    buttons.get("bisect.banner.continue")?.click();
    await waitForActions(client);
    expect(install).not.toHaveBeenCalled();
    expect(usePersistedStore.getState().bisectSession?.stage).toBe("applying");
    expect(translate).toHaveBeenCalledWith("bisect.toasts.switchFailed", {
      name: "snd-82623",
    });
    client.clear();
  });

  it("names every mod whose files could not be restored", async () => {
    const client = new QueryClient();
    addHealthyMod("another-missing-mod");
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    await waitForActions(client);
    expect(install).toHaveBeenCalledTimes(2);
    expect(translate).toHaveBeenCalledWith("bisect.toasts.restoreIncomplete", {
      names: "McGinnis' Old Minigun!, another-missing-mod",
    });
    expect(usePersistedStore.getState().bisectSession?.stage).toBe("restoring");
    client.clear();
  });

  it("skips failed downloads without invalid install status transitions", async () => {
    const client = new QueryClient();
    const healthy = addHealthyMod("healthy");
    const state = usePersistedStore.getState();
    const broken = state.localMods[0];
    const profile = state.getActiveProfile();
    if (!broken || !profile) throw new Error("Expected a recovery fixture");
    const mods = [{ ...broken, status: ModStatus.FailedToDownload }, healthy];
    usePersistedStore.setState({
      localMods: mods,
      profiles: { [profile.id]: { ...profile, mods } },
    });
    install.mockImplementationOnce(async (mod, options) => {
      options.onStart(mod);
      const installed = {
        id: mod.remoteId,
        name: mod.name,
        installed_vpks: ["pak01_dir.vpk"],
      };
      options.onComplete(mod, installed);
      return installed;
    });
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    await waitForActions(client);
    expect(install.mock.calls.map(([mod]) => mod.remoteId)).toEqual([
      "healthy",
    ]);
    expect(
      usePersistedStore
        .getState()
        .localMods.find((mod) => mod.remoteId === broken.remoteId)?.status,
    ).toBe(ModStatus.FailedToDownload);
    expect(
      usePersistedStore.getState().isModEnabledInCurrentProfile("healthy"),
    ).toBe(true);
    expect(translate).toHaveBeenCalledWith("bisect.toasts.restoreIncomplete", {
      names: broken.name,
    });
    client.clear();
  });

  it("stops a diagnostic round on missing files so its result stays reliable", async () => {
    const client = new QueryClient();
    addHealthyMod("healthy");
    const state = usePersistedStore.getState();
    state.updateBisectSession({
      stage: "applying",
      config: state.localMods.map((mod) => mod.remoteId),
    });
    renderBanner(client);
    buttons.get("bisect.banner.continue")?.click();
    await waitForActions(client);
    expect(install).toHaveBeenCalledTimes(1);
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(usePersistedStore.getState().bisectSession?.stage).toBe("applying");
    expect(translate).toHaveBeenCalledWith("bisect.toasts.switchFailed", {
      name: "McGinnis' Old Minigun!",
    });
    client.clear();
  });

  for (const kind of [
    "gameRunning",
    "io",
    "readOnlyFile",
    "unknown",
  ] satisfies ErrorKind["kind"][]) {
    it(`stops restoring on ${kind} without enabling later mods`, async () => {
      const client = new QueryClient();
      addHealthyMod("healthy");
      install.mockImplementationOnce(async (mod, options) => {
        options.onStart(mod);
        options.onError(mod, { kind, message: "Blocked" });
        return null;
      });
      renderBanner(client);
      buttons.get("bisect.banner.finishRestoring")?.click();
      await waitForActions(client);
      expect(install).toHaveBeenCalledTimes(1);
      expect(getSnapshot).not.toHaveBeenCalled();
      expect(
        usePersistedStore.getState().isModEnabledInCurrentProfile("healthy"),
      ).toBe(false);
      expect(usePersistedStore.getState().bisectSession?.stage).toBe(
        "restoring",
      );
      if (kind !== "gameRunning") {
        expect(translate).toHaveBeenCalledWith(
          "bisect.toasts.restoreSwitchFailed",
          { name: "McGinnis' Old Minigun!" },
        );
      }
      client.clear();
    });
  }

  it("keeps the saved search and mods when discarding is cancelled", async () => {
    const client = new QueryClient();
    confirm.mockResolvedValueOnce(false);
    const before = usePersistedStore.getState();
    renderBanner(client);
    const discard = buttons.get("bisect.banner.discard");
    if (!discard) throw new Error("Discard button is missing");
    await discard.click();
    await waitForActions(client);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(usePersistedStore.getState().bisectSession).toBe(
      before.bisectSession,
    );
    expect(usePersistedStore.getState().localMods).toBe(before.localMods);
    expect(install).not.toHaveBeenCalled();
    expect(invokeGuarded).not.toHaveBeenCalled();
    client.clear();
  });

  it("does not offer discard while files are still being restored", async () => {
    const client = new QueryClient();
    let finishInstall: () => void = noop;
    const installing = new Promise<void>((resolve) => {
      finishInstall = resolve;
    });
    install.mockImplementationOnce(async (mod, options) => {
      await installing;
      options.onError(mod, {
        kind: "unknown",
        message: "Mod file not found at path",
      });
      return null;
    });
    renderBanner(client);
    buttons.get("bisect.banner.finishRestoring")?.click();
    try {
      expect(client.isMutating()).toBe(1);
      renderBanner(client);
      expect(buttons.has("bisect.banner.discard")).toBe(false);
      expect(buttons.has("bisect.banner.finishRestoring")).toBe(false);
      expect(buttons.has("bisect.banner.stop")).toBe(false);
    } finally {
      finishInstall();
      await waitForActions(client);
      client.clear();
    }
  });
});
