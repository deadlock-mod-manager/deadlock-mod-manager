import { describe, expect, it } from "bun:test";
import type { GamePhase } from "@/types/generated/GamePhase";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";
import { BRIDGE_STALE_MS, liveViewState } from "./live-view";

const NOW = 1_700_000_000_000;

const board = (reportedAt: number | null): LiveScoreboard => ({
  clockSeconds: 600,
  friendly: [],
  enemy: [],
  team: "hiddenKing",
  reportedAt,
});

const status = (values: Partial<LiveMatchStatus>): LiveMatchStatus => ({
  consoleLogAvailable: true,
  queuedSince: null,
  current: null,
  recentMatchIds: [],
  scoreboard: null,
  ...values,
});

const inLobby = (phase: GamePhase) => ({
  matchId: "38201445",
  lobbyId: "1",
  phase,
});

const kindOf = (
  value: LiveMatchStatus,
  { gameRunning = true, needsSetup = false } = {},
) => liveViewState({ status: value, gameRunning, needsSetup, now: NOW }).kind;

describe("liveViewState", () => {
  it("shows a match while the bridge keeps reporting", () => {
    const value = status({
      current: inLobby("inProgress"),
      scoreboard: board(NOW - 2000),
    });
    expect(
      liveViewState({
        status: value,
        gameRunning: true,
        needsSetup: false,
        now: NOW,
      }),
    ).toEqual({
      kind: "match",
      board: board(NOW - 2000),
      matchId: "38201445",
      isOver: false,
    });
  });

  it("drops a board that went quiet mid-match", () => {
    const value = status({
      current: inLobby("inProgress"),
      scoreboard: board(NOW - BRIDGE_STALE_MS),
    });
    expect(kindOf(value)).toBe("noBridge");
  });

  it("keeps an ended match's board however old it is", () => {
    const value = status({
      current: inLobby("ended"),
      scoreboard: board(NOW - 10 * BRIDGE_STALE_MS),
    });
    expect(kindOf(value)).toBe("match");
  });

  it("ignores a log the closed game left behind", () => {
    const value = status({
      current: inLobby("inProgress"),
      scoreboard: board(NOW - 2000),
      queuedSince: NOW - 5000,
    });
    expect(kindOf(value, { gameRunning: false })).toBe("closed");
  });

  it("does not take a board without a lobby for a match", () => {
    const value = status({ scoreboard: board(NOW - 2000) });
    expect(kindOf(value)).toBe("waiting");
  });

  it("shows the queue with the backend's start time", () => {
    const value = status({ queuedSince: NOW - 30_000 });
    expect(
      liveViewState({
        status: value,
        gameRunning: true,
        needsSetup: false,
        now: NOW,
      }),
    ).toEqual({ kind: "queued", since: NOW - 30_000 });
  });

  it("asks for setup before anything that needs the bridge", () => {
    expect(kindOf(status({}), { needsSetup: true, gameRunning: false })).toBe(
      "needsSetup",
    );
  });
});
