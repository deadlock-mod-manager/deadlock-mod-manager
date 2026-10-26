import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ServerBrowserEntry } from "@deadlock-mods/shared";

mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { info: () => {}, success: () => {}, error: () => {} },
}));
const writeText = mock(async (_text: string) => {});
mock.module("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));
const openUrl = mock(async (_url: string) => {});
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl }));
interface JoinCommandArgs {
  address?: string;
  additionalArgs?: string;
  password?: string | null;
  coldStart?: boolean;
}

const invokeCommand = async (command: string, _args?: JoinCommandArgs) =>
  command === "resolve_connect_address" ? "203.0.113.10:27015" : undefined;
const invoke = mock(invokeCommand);
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@/lib/logger", () => {
  const logger = {
    withError: () => ({ error: () => {}, warn: () => {} }),
  };
  return {
    createLogger: () => logger,
    default: logger,
  };
});

const { buildSteamConnectUrl, joinServer } = await import("./join-action");
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
  managed_content: false,
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

  it("skips passwords that inject extra Source commands", () => {
    const result = buildConnectArgs(
      baseServer({ password_protected: true }),
      "x;+quit",
    );
    expect(result?.args).toBe("+connect 203.0.113.10:27015");
    expect(result?.passwordSkipped).toBe(true);
  });

  it("skips quoted passwords", () => {
    const result = buildConnectArgs(
      baseServer({ password_protected: true }),
      '"hunter2"',
    );
    expect(result?.args).toBe("+connect 203.0.113.10:27015");
    expect(result?.passwordSkipped).toBe(true);
  });

  it("skips passwords with surrounding whitespace instead of trimming them", () => {
    const result = buildConnectArgs(
      baseServer({ password_protected: true }),
      "hunter2 ",
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

  it("prefers a resolved address over the raw connect code", () => {
    const server = baseServer({ connect_code: "eu1.example.net:27015" });
    expect(buildSteamConnectUrl(server, "", "198.51.100.7:27015")).toBe(
      "steam://connect/198.51.100.7:27015",
    );
  });
});

describe("joinServer", () => {
  beforeEach(() => {
    invoke.mockReset().mockImplementation(invokeCommand);
    openUrl.mockReset().mockImplementation(async (_url: string) => {});
    writeText.mockClear();
  });

  it.each([
    ["p ss/wd&!", "p%20ss%2Fwd%26!"],
    ["x;+quit", "x%3B%2Bquit"],
    ['"hunter2"', "%22hunter2%22"],
    ["hunter2 ", "hunter2%20"],
  ])(
    "delivers password %j through Steam after launching with logging disabled",
    async (password, encodedPassword) => {
      const result = await joinServer({
        server: baseServer({ password_protected: true }),
        password,
        additionalArgs: "-novid +exec autoexec",
        gameRunning: false,
      });

      expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
        additionalArgs: "-novid +exec autoexec",
      });
      expect(openUrl).toHaveBeenCalledTimes(1);
      expect(openUrl).toHaveBeenCalledWith(
        `steam://connect/203.0.113.10:27015/${encodedPassword}`,
      );
      expect(invoke.mock.calls.map(([command]) => command)).not.toContain(
        "watch_server_connect",
      );
      expect(writeText).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: "steam-url" });
    },
  );

  it("waits for startup confirmation before submitting the Steam password", async () => {
    const started = Promise.withResolvers<void>();
    const confirmed = Promise.withResolvers<void>();
    invoke.mockImplementation(async (command) => {
      if (command === "launch_game_direct") {
        started.resolve();
        await confirmed.promise;
      }
      return invokeCommand(command);
    });
    const joining = joinServer({
      server: baseServer({ password_protected: true }),
      password: "p ss wd",
      additionalArgs: "",
      gameRunning: false,
    });
    await started.promise;
    expect(openUrl).not.toHaveBeenCalled();
    confirmed.resolve();
    await joining;
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(
      "steam://connect/203.0.113.10:27015/p%20ss%20wd",
    );
  });

  it("keeps launch-safe passwords in the launch arguments without logging", async () => {
    const result = await joinServer({
      server: baseServer({ password_protected: true }),
      password: "hunter2",
      additionalArgs: "-novid",
      gameRunning: false,
    });

    expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
      additionalArgs: "-novid +connect 203.0.113.10:27015 +password hunter2",
    });
    expect(openUrl).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "launched",
      passwordSkipped: false,
      watched: false,
    });
  });

  it("keeps the password warning when a lobby has no Steam connect address", async () => {
    const result = await joinServer({
      server: baseServer({
        password_protected: true,
        connect_code: "76561198000000000",
      }),
      password: "p ss wd",
      additionalArgs: "-novid",
      gameRunning: false,
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
      additionalArgs: "-novid +connect [76561198000000000]",
    });
    expect(openUrl).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "launched",
      passwordSkipped: true,
      watched: false,
    });
  });

  it("falls back to manual connection if the password handoff fails", async () => {
    openUrl.mockRejectedValueOnce(new Error("Steam URL failed"));
    const result = await joinServer({
      server: baseServer({ password_protected: true }),
      password: "p ss wd",
      additionalArgs: "-novid",
      gameRunning: false,
    });

    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("203.0.113.10:27015 p ss wd");
    expect(result).toEqual({ kind: "manual", code: "203.0.113.10:27015" });
  });

  it("keeps the password-bearing watchdog when logging is enabled", async () => {
    const result = await joinServer({
      server: baseServer({ password_protected: true }),
      password: "p ss wd",
      additionalArgs: "-condebug",
      gameRunning: false,
    });

    expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
      additionalArgs: "-condebug +connect 203.0.113.10:27015",
    });
    expect(invoke).toHaveBeenCalledWith("watch_server_connect", {
      address: "203.0.113.10:27015",
      password: "p ss wd",
      coldStart: true,
    });
    expect(openUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "launched", watched: true });
  });

  it.each(["", "-novid", "-condebuglog"])(
    "does not enable logging when launching with %j",
    async (additionalArgs) => {
      const result = await joinServer({
        server: baseServer(),
        password: "",
        additionalArgs,
        gameRunning: false,
      });

      expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
        additionalArgs: [additionalArgs, "+connect 203.0.113.10:27015"]
          .filter(Boolean)
          .join(" "),
      });
      expect(result).toEqual({
        kind: "launched",
        passwordSkipped: false,
        watched: false,
      });
      expect(invoke.mock.calls.map(([command]) => command)).not.toContain(
        "watch_server_connect",
      );
    },
  );

  it("preserves enabled logging and starts the reconnect watchdog", async () => {
    const result = await joinServer({
      server: baseServer(),
      password: "",
      additionalArgs: "-condebug",
      gameRunning: false,
    });

    expect(invoke).toHaveBeenCalledWith("launch_game_direct", {
      additionalArgs: "-condebug +connect 203.0.113.10:27015",
    });
    expect(invoke).toHaveBeenCalledWith("watch_server_connect", {
      address: "203.0.113.10:27015",
      password: null,
      coldStart: true,
    });
    expect(result).toMatchObject({ kind: "launched", watched: true });
  });
});
