import { beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InstallWithCollectionFunction } from "@/hooks/use-install-with-collection";
import { createBisect } from "@/lib/bisect/search";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import { ModStatus } from "@/types/mods";

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
const install = mock<InstallWithCollectionFunction>(async (mod, options) => {
  options.onError(mod, {
    kind: "unknown",
    message: "Mod file not found at path",
  });
  return null;
});
const invokeGuarded = mock(async () => undefined);
const confirm = mock(async () => true);
const toastError = mock(noop);
const buttons = new Map<
  string,
  { click: () => void | Promise<void>; disabled: boolean }
>();

mock.module("@/lib/logger", () => ({
  default: logger,
  createLogger: () => logger,
}));
mock.module("@tauri-apps/plugin-store", () => ({
  getStore: async () => undefined,
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
  useTranslation: () => ({ t: (key: string) => key }),
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

describe("broken mod search recovery", () => {
  beforeEach(() => {
    usePersistedStore.setState(usePersistedStore.getInitialState(), true);
    install.mockClear();
    invokeGuarded.mockClear();
    confirm.mockClear();
    toastError.mockClear();
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
    mod.status = ModStatus.FailedToDownload;
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
    expect(toastError).toHaveBeenCalledWith("bisect.toasts.restoreFailed");

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
