import { browser } from "@wdio/globals";
import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ChainablePromiseElement } from "webdriverio";
import { nativePickerBinary } from "./native-picker";
import {
  linuxNativeInput,
  type NativeInputRequest,
} from "./linux-native-input";

const execute = promisify(execFile);
const center = async (element?: ChainablePromiseElement) => {
  if (!element) return { x: 0, y: 0 };
  const location = await element.getLocation();
  const size = await element.getSize();
  return { x: location.x + size.width / 2, y: location.y + size.height / 2 };
};

export const nativeInput = async (
  action: NativeInputRequest["Action"],
  start: ChainablePromiseElement,
  end?: ChainablePromiseElement,
  offset = { x: 0, y: 0 },
): Promise<void> => {
  const runtime = await browser.execute(() =>
    // oxlint-disable-next-line no-underscore-dangle -- Tauri owns this IPC global.
    window.__TAURI_INTERNALS__.invoke<{
      processId: number;
      roots: { world: string };
    }>("e2e_status"),
  );
  const viewport = await browser.execute(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const from = action === "pointer-up" ? { x: 0, y: 0 } : await center(start);
  const to = await center(end);
  const input: NativeInputRequest = {
    Action: action,
    X: from.x + offset.x,
    Y: from.y + offset.y,
    EndX: to.x,
    EndY: to.y,
    Width: viewport.width,
    Height: viewport.height,
  };
  const request = JSON.stringify(input);
  const logPath = path.join(
    runtime.roots.world,
    "artifacts",
    "native-input.log",
  );
  await appendFile(logPath, `${request}\n`);
  try {
    if (process.platform === "linux") {
      await linuxNativeInput(runtime.processId, runtime.roots.world, input);
      return;
    }
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
