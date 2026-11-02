import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test.each(["nightly.yml", "release.yml"])(
  "%s passes the environment signing key to the reusable CEF workflow",
  (file) => {
    const workflow = readFileSync(
      new URL(`../../.github/workflows/${file}`, import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const cefJob = workflow
      .split("\n  build-cef:\n")[1]
      ?.split(/\n  [\w-]+:\n/)[0];

    expect(cefJob).toBeDefined();
    expect(cefJob).toContain(
      "      TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}",
    );
  },
);

test("the reusable CEF workflow requires callers to pass its signing key", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/_build-cef.yml", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");

  expect(workflow).toContain(
    "      TAURI_PRIVATE_KEY:\n        required: true",
  );
});

test.each([undefined, "", "   ", "fixture-private-key"])(
  "CEF checks signing key availability before setup (%j)",
  (key) => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/_build-cef.yml", import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const check = workflow
      .split("      - name: Check updater signing key\n")[1]
      ?.split("      - name: Checkout repository")[0];
    const script = check
      ?.split("          script: |\n")[1]
      ?.replace(/^            /gm, "");
    if (!script) throw new Error("CEF signing key check missing");
    const failures: string[] = [];

    runInNewContext(script, {
      process: { env: { TAURI_SIGNING_PRIVATE_KEY: key } },
      core: { setFailed: (message: string) => failures.push(message) },
    });

    if (key?.trim()) {
      expect(failures).toEqual([]);
    } else {
      expect(failures).toEqual([
        "TAURI_PRIVATE_KEY is empty or unavailable. Configure it in the selected GitHub environment and pass it from the calling workflow.",
      ]);
    }
  },
);
