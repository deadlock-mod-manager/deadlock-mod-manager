import { describe, expect, it, mock } from "bun:test";
import type { ServerBrowserEntry } from "@deadlock-mods/shared";

mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { info: () => {}, success: () => {}, error: () => {} },
}));
mock.module("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: async () => {},
}));
mock.module("@tauri-apps/plugin-opener", () => ({
  openUrl: async () => {},
}));
mock.module("@/lib/logger", () => ({
  default: {
    withError: () => ({ error: () => {}, warn: () => {} }),
  },
}));

const { buildSteamConnectUrl } = await import("./join-action");

const baseServer = (
  overrides: Partial<ServerBrowserEntry> = {},
): ServerBrowserEntry => ({
  id: "srv1",
  name: "Test Server",
  player_count: 0,
  max_players: 12,
  map: "default_map",
  game_mode: "ad_hoc",
  password_protected: false,
  connect_code: "203.0.113.10:27015",
  required_mods: [],
  ...(overrides as ServerBrowserEntry),
});

describe("buildSteamConnectUrl", () => {
  it("returns null when there is no connect_code", () => {
    const server = baseServer({ connect_code: undefined });
    expect(buildSteamConnectUrl(server, "")).toBeNull();
  });

  it("returns null when connect_code is whitespace", () => {
    const server = baseServer({ connect_code: "   " });
    expect(buildSteamConnectUrl(server, "")).toBeNull();
  });

  it("returns a bare steam:// URL when not password-protected", () => {
    const server = baseServer();
    expect(buildSteamConnectUrl(server, "")).toBe(
      "steam://connect/203.0.113.10:27015",
    );
  });

  it("returns a bare steam:// URL when password-protected but no password supplied", () => {
    const server = baseServer({ password_protected: true });
    expect(buildSteamConnectUrl(server, "")).toBe(
      "steam://connect/203.0.113.10:27015",
    );
  });

  it("appends an encoded password when supplied", () => {
    const server = baseServer({ password_protected: true });
    expect(buildSteamConnectUrl(server, "p ss/wd&!")).toBe(
      "steam://connect/203.0.113.10:27015/p%20ss%2Fwd%26!",
    );
  });

  it("trims whitespace around the connect code", () => {
    const server = baseServer({ connect_code: "  10.0.0.1:27015  " });
    expect(buildSteamConnectUrl(server, "")).toBe(
      "steam://connect/10.0.0.1:27015",
    );
  });
});
