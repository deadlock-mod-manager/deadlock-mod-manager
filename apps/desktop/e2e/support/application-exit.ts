import { browser } from "@wdio/globals";
import { setTimeout } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { processExists } from "./process-control";
import { assertOwnedWorld } from "./world";
import { readPersistedDocument } from "./observations";
import { step } from "./evidence";

export const retireClosedApplication = async (pid: number): Promise<void> => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (!processExists(pid)) {
      // The embedded server died with its app. Retire the client session so
      // WDIO does not send DELETE to a server whose exit we just verified.
      // @wdio/globals only proxies reads; update the injected instance itself.
      globalThis.browser.sessionId = "";
      assert.equal(browser.sessionId, "");
      return;
    }
    await setTimeout(100);
  }
  throw new Error("Application did not exit");
};

export const closeApplication = async (
  world: string,
  pid: number,
): Promise<void> =>
  step("close application normally", async () => {
    // Return the WebDriver response before closing its webview. Normal window
    // close lets Tauri finish its exit-time store save; Windows SIGTERM does not.
    await browser.execute(() => {
      window.setTimeout(() => {
        void window.__TAURI_INTERNALS__.invoke("plugin:window|close", {
          label: "main",
        });
      }, 100);
    });
    await retireClosedApplication(pid);
    const { configuration } = await assertOwnedWorld(world);
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase && /^[a-z-]+$/.test(phase));
    const document = await readPersistedDocument(world);
    await writeFile(
      path.join(world, "artifacts", `phase-completed-${phase}.json`),
      JSON.stringify({
        processId: pid,
        runId: configuration.runId,
        caseId: configuration.caseId,
        phase,
        document,
      }),
    );
  });
