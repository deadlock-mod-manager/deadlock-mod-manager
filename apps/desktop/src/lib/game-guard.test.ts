import { describe, expect, it } from "bun:test";
import {
  type GameGuardDeps,
  type GuardedCommand,
  isGameRunningError,
  runGuarded,
} from "./game-guard";

const gameRunning = { kind: "gameRunning", message: "Game is running" };

type Call = { command: string; args?: Record<string, unknown> };

const PERMIT = "permit-1";

/** Fails the guarded command unless it carries the token the override issued. */
const backend = (options: { blocked: boolean }) => {
  const calls: Call[] = [];
  let issued: string | null = null;
  const invoke = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    calls.push({ command, args });
    if (command === "allow_next_game_file_operation") {
      issued = PERMIT;
      return PERMIT as T;
    }
    const permitted = issued !== null && args?.guardPermit === issued;
    if (options.blocked && !permitted) throw gameRunning;
    if (permitted) issued = null;
    return "done" as T;
  };
  return { invoke, calls };
};

const deps = (
  overrides: Partial<GameGuardDeps> & { blocked?: boolean } = {},
): GameGuardDeps & { calls: Call[] } => {
  const { invoke, calls } = backend({ blocked: overrides.blocked ?? false });
  return {
    invoke: overrides.invoke ?? invoke,
    confirmOverride: overrides.confirmOverride ?? (async () => false),
    calls,
  };
};

const COMMAND: GuardedCommand = "reorder_mods";

describe("isGameRunningError", () => {
  it("recognizes the backend's block", () => {
    expect(isGameRunningError(gameRunning)).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isGameRunningError({ kind: "io", message: "boom" })).toBe(false);
    expect(isGameRunningError(new Error("boom"))).toBe(false);
    expect(isGameRunningError(null)).toBe(false);
  });
});

describe("runGuarded", () => {
  it("passes the command straight through when nothing blocks it", async () => {
    const dependencies = deps();
    let asked = false;
    dependencies.confirmOverride = async () => {
      asked = true;
      return true;
    };

    await expect(
      runGuarded(dependencies, COMMAND, { profileFolder: null }),
    ).resolves.toBe("done");
    expect(asked).toBe(false);
    expect(dependencies.calls).toEqual([
      { command: COMMAND, args: { profileFolder: null } },
    ]);
  });

  it("retries once with the override after the user confirms", async () => {
    const dependencies = deps({
      blocked: true,
      confirmOverride: async () => true,
    });

    await expect(runGuarded(dependencies, COMMAND)).resolves.toBe("done");
    expect(dependencies.calls.map((call) => call.command)).toEqual([
      COMMAND,
      "allow_next_game_file_operation",
      COMMAND,
    ]);
  });

  it("arms the override for the command it confirmed", async () => {
    const dependencies = deps({
      blocked: true,
      confirmOverride: async () => true,
    });

    await runGuarded(dependencies, COMMAND);

    expect(dependencies.calls[1]).toEqual({
      command: "allow_next_game_file_operation",
      args: { operation: COMMAND },
    });
  });

  it("keeps the block when the user cancels", async () => {
    const dependencies = deps({
      blocked: true,
      confirmOverride: async () => false,
    });

    await expect(runGuarded(dependencies, COMMAND)).rejects.toMatchObject({
      kind: "gameRunning",
    });
    expect(dependencies.calls.map((call) => call.command)).toEqual([COMMAND]);
  });

  it("passes the issued permit back only on the retry", async () => {
    const dependencies = deps({
      blocked: true,
      confirmOverride: async () => true,
    });

    await runGuarded(dependencies, COMMAND, { profileFolder: null });

    expect(dependencies.calls[0]?.args).toEqual({ profileFolder: null });
    expect(dependencies.calls.at(-1)?.args).toEqual({
      profileFolder: null,
      guardPermit: PERMIT,
    });
  });

  it("passes the original arguments to the retry", async () => {
    const dependencies = deps({
      blocked: true,
      confirmOverride: async () => true,
    });
    const args = { modId: "42", vpks: ["a.vpk"] };

    await runGuarded(dependencies, "uninstall_mod", args);

    expect(dependencies.calls.at(-1)).toEqual({
      command: "uninstall_mod",
      args: { ...args, guardPermit: PERMIT },
    });
  });

  it("never asks about unrelated failures", async () => {
    let asked = false;
    const dependencies = deps({
      invoke: () => Promise.reject(new Error("disk full")),
      confirmOverride: async () => {
        asked = true;
        return true;
      },
    });

    await expect(runGuarded(dependencies, COMMAND)).rejects.toThrow(
      "disk full",
    );
    expect(asked).toBe(false);
  });
});
