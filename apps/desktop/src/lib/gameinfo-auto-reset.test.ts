import { describe, expect, it } from "bun:test";
import {
  didGameExit,
  gameinfoAutoResetPauseCount,
  isGameinfoAutoResetPaused,
  pauseGameinfoAutoReset,
} from "./gameinfo-auto-reset";

describe("didGameExit", () => {
  it("fires when the game goes from running to stopped", () => {
    expect(didGameExit(true, false)).toBe(true);
  });

  it("ignores the first poll after the app starts", () => {
    expect(didGameExit(undefined, false)).toBe(false);
  });

  it("ignores polls where nothing changed", () => {
    expect(didGameExit(false, false)).toBe(false);
    expect(didGameExit(true, true)).toBe(false);
  });

  it("ignores the game starting", () => {
    expect(didGameExit(false, true)).toBe(false);
  });
});

describe("pauseGameinfoAutoReset", () => {
  it("pauses until released", () => {
    expect(isGameinfoAutoResetPaused()).toBe(false);
    const release = pauseGameinfoAutoReset();
    expect(isGameinfoAutoResetPaused()).toBe(true);
    release();
    expect(isGameinfoAutoResetPaused()).toBe(false);
  });

  it("counts each pause so a watcher can tell one happened between polls", () => {
    const before = gameinfoAutoResetPauseCount();
    pauseGameinfoAutoReset()();
    expect(gameinfoAutoResetPauseCount()).toBe(before + 1);
  });

  it("stays paused until overlapping flows all finish", () => {
    const releaseFirst = pauseGameinfoAutoReset();
    const releaseSecond = pauseGameinfoAutoReset();
    releaseSecond();
    expect(isGameinfoAutoResetPaused()).toBe(true);
    releaseFirst();
    expect(isGameinfoAutoResetPaused()).toBe(false);
  });
});
