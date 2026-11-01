import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { browser } from "@wdio/globals";
import { observeUntil } from "./observations";
import { assertOwnedWorld } from "./world";

// Mirrors `runtime_environment::e2e_game_argv0`: E2E builds count only this
// world's stand-in as Deadlock, so it never affects another run on the machine.
const GAME_FILE_NAME = "dmm-e2e-game";

const appSeesGame = () =>
  browser.execute(() =>
    // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
    window.__TAURI_INTERNALS__.invoke<boolean>("is_game_running"),
  );

/** Starts a process the app counts as a running Deadlock until it is stopped. */
export const startFakeGame = async (world: string): Promise<ChildProcess> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const game = spawn("sleep", ["600"], {
    argv0: path.join(roots.game, GAME_FILE_NAME),
    stdio: "ignore",
  });
  await once(game, "spawn");
  await observeUntil("the app sees the game running", appSeesGame, Boolean);
  return game;
};

/** Ends the stand-in and waits until the app no longer sees it. */
export const stopFakeGame = async (game: ChildProcess) => {
  if (game.exitCode === null && game.signalCode === null) {
    const exited = once(game, "exit");
    game.kill("SIGKILL");
    await exited;
  }
  await observeUntil(
    "the app sees the game closed",
    appSeesGame,
    (running) => !running,
  );
};
