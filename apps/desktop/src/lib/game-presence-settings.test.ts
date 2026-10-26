import { beforeEach, describe, expect, it, mock } from "bun:test";

let enabled = true;
let failure: Error | null = null;
const invoke = mock(async (_command: string) => {
  if (failure) throw failure;
});
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@/lib/store", () => ({
  usePersistedStore: {
    getState: () => ({
      setGamePresenceEnabled: (value: boolean) => {
        enabled = value;
      },
    }),
  },
}));

const { applyGamePresenceSetting } = await import("./game-presence-settings");

describe("applyGamePresenceSetting", () => {
  beforeEach(() => {
    enabled = true;
    failure = null;
    invoke.mockClear();
  });

  it("clears Steam's saved logging flag before saving the disabled state", async () => {
    await applyGamePresenceSetting(false);
    expect(invoke).toHaveBeenCalledWith("clear_steam_condebug");
    expect(enabled).toBe(false);
  });

  it("keeps the setting enabled when Steam cleanup fails", async () => {
    failure = new Error("Steam is running");
    await expect(applyGamePresenceSetting(false)).rejects.toThrow(
      "Steam is running",
    );
    expect(enabled).toBe(true);
  });

  it("enables game presence without editing Steam's settings", async () => {
    enabled = false;
    await applyGamePresenceSetting(true);
    expect(invoke).not.toHaveBeenCalled();
    expect(enabled).toBe(true);
  });
});
