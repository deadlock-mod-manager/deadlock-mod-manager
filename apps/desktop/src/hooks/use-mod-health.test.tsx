import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as tauriCore from "@tauri-apps/api/core";
import { renderToStaticMarkup } from "react-dom/server";

type CheckArgs = { profileFolder: string | null };
const checks: { args: CheckArgs; finish: () => void }[] = [];

mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: (_command: string, args: CheckArgs) =>
    new Promise((resolve) => {
      checks.push({
        args,
        finish: () =>
          resolve({ gameBuild: null, previousGameBuild: null, mods: [] }),
      });
    }),
}));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@/components/providers/compatibility-review", () => ({
  useCompatibilityReview: () => async () => false,
}));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));

const { useCheckModHealth } = await import("./use-mod-health");
const { usePersistedStore } = await import("@/lib/store");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useCheckModHealth", () => {
  // A library change in another profile, such as a download that lands there
  // after a profile switch, must not drop the check queued for this one.
  it("keeps a queued check for each profile while another check runs", async () => {
    usePersistedStore.setState({ gamePath: "/game" });
    const callbacks: ReturnType<typeof useCheckModHealth>[] = [];
    const Probe = () => {
      callbacks.push(useCheckModHealth());
      return null;
    };
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
    const check = callbacks[0];
    if (!check) throw new Error("useCheckModHealth did not render");

    check({ profileFolder: "running" });
    await settle();
    check({ profileFolder: "active" });
    check({ profileFolder: "inactive" });
    for (let index = 0; index < 3; index++) {
      checks[index]?.finish();
      await settle();
    }

    expect(checks.map(({ args }) => args.profileFolder).sort()).toEqual([
      "active",
      "inactive",
      "running",
    ]);
  });
});
