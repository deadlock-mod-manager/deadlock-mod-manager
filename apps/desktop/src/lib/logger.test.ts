import { describe, expect, it, mock } from "bun:test";

const shippedErrors: Array<{ message: string }> = [];

mock.module("@tauri-apps/plugin-log", () => ({
  debug: () => undefined,
  error: (message: string) => {
    shippedErrors.push({ message });
  },
  info: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
}));

describe("desktop logger transport", () => {
  it("ships a non-empty errorOnly message with the serialized error message", async () => {
    shippedErrors.length = 0;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { __TAURI_INTERNALS__: {} },
    });
    const { default: logger } = await import("./logger");

    logger.errorOnly(new Error("Portal selection failed"));
    await Promise.resolve();
    await Promise.resolve();

    expect(shippedErrors).toHaveLength(1);
    expect(shippedErrors[0]?.message).not.toBe("");
    expect(shippedErrors[0]?.message).toContain("Portal selection failed");
    Reflect.deleteProperty(globalThis, "window");
  });

  it("bounds messages and redacts local paths", async () => {
    const { formatShippedMessage } = await import("./logger");
    const message = formatShippedMessage([
      `Invalid game directory C:\\Users\\player\\Games\\Deadlock ${"x".repeat(3_000)}`,
    ]);

    expect(message).toContain("Invalid game directory <local-path>");
    expect(message).not.toContain("player");
    expect(message.length).toBeLessThanOrEqual(2_048);
  });
});
