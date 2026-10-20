import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import * as tauriLog from "@tauri-apps/plugin-log";
import logger from "./logger";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const shippedError = spyOn(tauriLog, "error").mockResolvedValue(undefined);
const consoleError = spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __TAURI_INTERNALS__: {} },
  });
  shippedError.mockClear();
});

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("frontend error log payload", () => {
  it("ships the error type and message when errorOnly has no message", () => {
    logger.errorOnly(new TypeError("Invalid game directory"));
    expect(shippedError).toHaveBeenCalledTimes(1);
    expect(shippedError.mock.calls[0]?.[0]).toContain("TypeError");
    expect(shippedError.mock.calls[0]?.[0]).toContain("Invalid game directory");
  });

  it("keeps both context and the error reason without copying arbitrary fields", () => {
    logger
      .withMetadata({ operation: "set-game-path" })
      .withError(
        Object.assign(new Error("Directory does not exist"), {
          token: "private-token",
        }),
      )
      .error("Could not select game path");
    const [message, options] = shippedError.mock.calls[0] ?? [];
    expect(message).toContain("Could not select game path");
    expect(message).toContain("Directory does not exist");
    expect(message).not.toContain("private-token");
    expect(options?.keyValues?.operation).toBe("set-game-path");
    expect(options?.keyValues?.error).toBe("Error: Directory does not exist");
    expect(JSON.stringify(options)).not.toContain("private-token");
  });

  it("keeps string rejections useful and bounds long error details", () => {
    logger.errorOnly("IPC disconnected");
    expect(shippedError.mock.calls[0]?.[0]).toContain("IPC disconnected");

    logger.errorOnly(new Error("x".repeat(10_000)));
    const message = shippedError.mock.calls[1]?.[0] ?? "";
    expect(message.length).toBeGreaterThan(0);
    expect(message.length).toBeLessThanOrEqual(2048);
    expect(shippedError.mock.calls[1]?.[1]?.keyValues?.error).toBe(message);
  });
});

afterAll(() => {
  consoleError.mockRestore();
  shippedError.mockRestore();
});
