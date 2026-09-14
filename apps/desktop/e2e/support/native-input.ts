import { browser } from "@wdio/globals";
import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ChainablePromiseElement } from "webdriverio";
import { nativePickerBinary } from "./native-picker";

const execute = promisify(execFile);
export const nativeInput = async (
  action: "click" | "drag" | "keyboard-reorder",
  start: ChainablePromiseElement,
  end?: ChainablePromiseElement,
): Promise<void> => {
  const runtime = await browser.execute(() =>
    window.__TAURI_INTERNALS__.invoke<{
      processId: number;
      roots: { world: string };
    }>("e2e_status"),
  );
  const viewport = await browser.execute(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const center = async (element?: ChainablePromiseElement) => {
    if (!element) return { x: 0, y: 0 };
    const location = await element.getLocation();
    const size = await element.getSize();
    return { x: location.x + size.width / 2, y: location.y + size.height / 2 };
  };
  const from = await center(start);
  const to = await center(end);
  const request = JSON.stringify({
    Action: action,
    X: from.x,
    Y: from.y,
    EndX: to.x,
    EndY: to.y,
    Width: viewport.width,
    Height: viewport.height,
  });
  const logPath = path.join(
    runtime.roots.world,
    "artifacts",
    "native-input.log",
  );
  await appendFile(logPath, `${request}\n`);
  try {
    const result = await execute(
      nativePickerBinary,
      [String(runtime.processId), runtime.roots.world, request],
      { windowsHide: true, timeout: 20_000 },
    );
    await appendFile(logPath, result.stdout + result.stderr);
  } catch (error) {
    await appendFile(
      logPath,
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    throw error;
  }
};
