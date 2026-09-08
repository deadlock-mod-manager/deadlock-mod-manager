import { expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertNoHarnessBinary,
  assertNoHarnessDependencies,
  assertNoHarnessText,
} from "./release-surface";

it("rejects linked harness dependencies and injected capabilities", () => {
  assertNoHarnessDependencies("tauri v2.11.1\ntauri-plugin-store v2.4.3");
  expect(() =>
    assertNoHarnessDependencies("tauri-plugin-wdio-webdriver v1.3.0"),
  ).toThrow();
  expect(() =>
    assertNoHarnessDependencies("tauri-plugin-wdio v1.3.0"),
  ).toThrow();
  expect(() =>
    assertNoHarnessText('{"permissions":["wdio:default"]}', "capabilities"),
  ).toThrow();
  expect(() =>
    assertNoHarnessText("window.__wdio_original_core__ = core", "frontend"),
  ).toThrow();
});

it("detects ASCII and UTF-16 control markers across binary read boundaries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dmm-release-test-"));
  const file = path.join(directory, "fixture.bin");
  try {
    await writeFile(file, Buffer.alloc(128, 1));
    await assertNoHarnessBinary(file, 8);
    for (const marker of [
      Buffer.from("e2e_status"),
      Buffer.from("WDIO_EMBEDDED_SERVER", "utf16le"),
    ]) {
      await writeFile(
        file,
        Buffer.concat([Buffer.alloc(7, 1), marker, Buffer.alloc(9, 2)]),
      );
      await expect(assertNoHarnessBinary(file, 8)).rejects.toThrow(
        "harness marker",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
