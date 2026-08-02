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
mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => {},
}));
mock.module("@/lib/logger", () => {
  const logger = {
    withError: () => ({ error: () => {}, warn: () => {} }),
  };
  return {
    createLogger: () => logger,
    default: logger,
  };
});

const { buildSteamConnectUrl } = await import("./join-action");
const { buildConnectArgs, normalizeConnectCode } =
  await import("./connect-args");

const defaultServer: ServerBrowserEntry = {
  id: "srv1",
  name: "Test Server",
  ip: "203.0.113.10",
  port: 27015,
  visibility: "public",
  password_protected: false,
  connect_code: "203.0.113.10:27015",
  gateway_url: "",
  player_count: 0,
  max_players: 12,
  map: "default_map",
  game_mode: "ad_hoc",
  version: "",
  players: [],
  mods: [],
  required_mods: [],
  last_seen: "2026-01-01T00:00:00.000Z",
  auth_required: false,
  auth_providers: [],
  source_relay: "test-relay",
};

type BaseServerOverrides = Partial<
  Pick<ServerBrowserEntry, "connect_code" | "password_protected">
>;

const baseServer = (
  overrides: BaseServerOverrides = {},
): ServerBrowserEntry => ({
  ...defaultServer,
  ...overrides,
});

describe("normalizeConnectCode", () => {
  it("returns null for empty or whitespace codes", () => {
    expect(normalizeConnectCode("")).toBeNull();
    expect(normalizeConnectCode("   ")).toBeNull();
    expect(normalizeConnectCode(undefined)).toBeNull();
  });

  it("accepts ipv4 host:port", () => {
    expect(normalizeConnectCode("  10.0.0.1:27015  ")).toBe("10.0.0.1:27015");
  });

  it("accepts hostname:port", () => {
    expect(normalizeConnectCode("eu1.example.net:27015")).toBe(
      "eu1.example.net:27015",
    );
  });

  it("wraps a bare lobby id in brackets", () => {
    expect(normalizeConnectCode("76561198000000000")).toBe(
      "[76561198000000000]",
    );
    expect(normalizeConnectCode("[76561198000000000]")).toBe(
      "[76561198000000000]",
    );
  });

  it("rejects out-of-range octets and ports", () => {
    expect(normalizeConnectCode("999.0.0.1:27015")).toBeNull();
    expect(normalizeConnectCode("10.0.0.1:70000")).toBeNull();
    expect(normalizeConnectCode("10.0.0.1:0")).toBeNull();
  });

  it("rejects codes that could inject extra launch options", () => {
    expect(normalizeConnectCode("10.0.0.1:27015 +exec evil")).toBeNull();
    expect(normalizeConnectCode('10.0.0.1:27015"')).toBeNull();
    expect(normalizeConnectCode("10.0.0.1:27015; rm -rf /")).toBeNull();
  });
});

describe("buildConnectArgs", () => {
  it("returns null when the connect code is unusable", () => {
    expect(buildConnectArgs(baseServer({ connect_code: "" }), "")).toBeNull();
  });

  it("builds a bare +connect for open servers", () => {
    expect(buildConnectArgs(baseServer(), "")?.args).toBe(
      "+connect 203.0.113.10:27015",
    );
  });

  it("ignores a password on servers that don't ask for one", () => {
    expect(buildConnectArgs(baseServer(), "hunter2")?.args).toBe(
      "+connect 203.0.113.10:27015",
    );
  });

  it("appends +password for password-protected servers", () => {
    const result = buildConnectArgs(
      baseServer({ password_protected: true }),
      "hunter2",
    );
    expect(result?.args).toBe("+connect 203.0.113.10:27015 +password hunter2");
    expect(result?.passwordSkipped).toBe(false);
  });

  it("skips passwords that can't be passed as a launch option", () => {
    const result = buildConnectArgs(
      baseServer({ password_protected: true }),
      "p ss wd",
    );
    expect(result?.args).toBe("+connect 203.0.113.10:27015");
    expect(result?.passwordSkipped).toBe(true);
  });
});

describe("buildSteamConnectUrl", () => {
  it("returns null when there is no connect_code", () => {
    const server = baseServer({ connect_code: "" });
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
