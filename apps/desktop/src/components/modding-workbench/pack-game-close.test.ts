import { describe, expect, test } from "bun:test";
import {
  closeGameForPack,
  type PackGameCloseDependencies,
} from "./pack-game-close";

const setup = (running: boolean[], accepted = true) => {
  const events: string[] = [];
  const dependencies: PackGameCloseDependencies = {
    isRunning: async () => {
      events.push("check");
      return running.length > 1
        ? (running.shift() ?? false)
        : (running[0] ?? false);
    },
    confirmClose: async () => {
      events.push("confirm");
      return accepted;
    },
    stop: async () => {
      events.push("stop");
    },
    wait: async () => {
      events.push("wait");
    },
    onStopping: () => {
      events.push("stopping");
    },
  };
  return { dependencies, events };
};

describe("Pack & Test game-close preflight", () => {
  test("does not prompt or stop when Deadlock is already closed", async () => {
    const { dependencies, events } = setup([false]);
    expect(await closeGameForPack(dependencies)).toBe("ready");
    expect(events).toEqual(["check"]);
  });

  test("cancel leaves the game running without stopping or waiting", async () => {
    const { dependencies, events } = setup([true], false);
    expect(await closeGameForPack(dependencies)).toBe("cancelled");
    expect(events).toEqual(["check", "confirm"]);
  });

  test("acceptance stops the game and waits for observed exit", async () => {
    const { dependencies, events } = setup([true, true, true, false]);
    expect(await closeGameForPack(dependencies)).toBe("ready");
    expect(events).toEqual([
      "check",
      "confirm",
      "stopping",
      "stop",
      "check",
      "wait",
      "check",
      "wait",
      "check",
    ]);
  });

  test("timeout prevents proceeding while Deadlock remains running", async () => {
    const { dependencies, events } = setup([true]);
    expect(await closeGameForPack(dependencies)).toBe("still-running");
    expect(events.filter((event) => event === "wait")).toHaveLength(40);
    expect(events.filter((event) => event === "stop")).toHaveLength(1);
  });

  test("a stop failure prevents readiness", async () => {
    const { dependencies, events } = setup([true]);
    dependencies.stop = async () => {
      throw new Error("stop failed");
    };
    await expect(closeGameForPack(dependencies)).rejects.toThrow("stop failed");
    expect(events).toEqual(["check", "confirm", "stopping"]);
  });
});
