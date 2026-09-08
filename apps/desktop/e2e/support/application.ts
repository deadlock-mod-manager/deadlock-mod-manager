import { $, browser, expect } from "@wdio/globals";
import { step } from "./evidence";
import { writeFile } from "node:fs/promises";
import path from "node:path";

declare global {
  interface Window {
    __TAURI_INTERNALS__: {
      invoke: <TResult, TArguments extends object = object>(
        command: string,
        argumentsValue?: TArguments,
      ) => Promise<TResult>;
    };
  }
}

export type ApplicationStatus = {
  processId: number;
  runId: string;
  caseId: string;
  applicationIdentity: string;
  runtime: string;
  roots: { world: string };
};

export const startApplication = () =>
  step("application ready", async () => {
    const runtime = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<ApplicationStatus>("e2e_status"),
    );
    expect(runtime.runId).toBe(process.env.DMM_E2E_RUN_ID);
    expect(runtime.caseId).toBe(process.env.DMM_E2E_CASE_ID);
    const phase = process.env.DMM_E2E_PHASE;
    if (!phase || !/^[a-z-]+$/.test(phase))
      throw new Error("Invalid application phase");
    await writeFile(
      path.join(
        runtime.roots.world,
        "artifacts",
        `phase-started-${phase}.json`,
      ),
      JSON.stringify({ ...runtime, phase }),
    );
    const unseen = await browser.execute(
      async () =>
        localStorage.getItem("lastSeenVersion") !==
        (await window.__TAURI_INTERNALS__.invoke<string>("plugin:app|version")),
    );
    if (unseen) {
      const dismiss = await $("button=Got it!");
      await dismiss.waitForDisplayed();
      await dismiss.click();
      await expect(dismiss).not.toBeDisplayed();
    }
    return runtime;
  });
