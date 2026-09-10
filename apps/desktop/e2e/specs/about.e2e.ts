import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

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

type E2eStatus = {
  runId: string;
  caseId: string;
  applicationIdentity: string;
  runtime: string;
  roots: { world: string };
};

const persistedStateSchema = z.object({
  state: z
    .object({ hasCompletedOnboarding: z.boolean().optional() })
    .optional(),
});

describe("DMM native smoke", () => {
  it("clicks through the About UI and reaches Rust IPC", async () => {
    const persistedState = await browser.execute(async () => {
      const bootstrap = await window.__TAURI_INTERNALS__.invoke<{
        stateStorePath: string;
      }>("get_runtime_bootstrap");
      const rid = await window.__TAURI_INTERNALS__.invoke<number | null>(
        "plugin:store|get_store",
        { path: bootstrap.stateStorePath },
      );
      if (rid === null) return null;
      const [value, exists] = await window.__TAURI_INTERNALS__.invoke<
        [string, boolean]
      >("plugin:store|get", { rid, key: "local-config" });
      if (!exists) return null;
      return value;
    });
    expect(
      persistedState === null
        ? null
        : persistedStateSchema.parse(JSON.parse(persistedState)).state
            ?.hasCompletedOnboarding,
    ).toBe(true);

    const whatsNewDismiss = await $("button=Got it!");
    if (await whatsNewDismiss.isDisplayed()) {
      await whatsNewDismiss.click();
    }

    const settingsLink = await $('a[href="/settings"]');
    await settingsLink.waitForClickable();
    await settingsLink.click();
    await expect(browser).toHaveUrl(expect.stringContaining("/settings"));

    const informationTab = await $("button=Information");
    await informationTab.scrollIntoView({ block: "center" });
    await informationTab.waitForClickable();
    await informationTab.click();
    await expect(informationTab).toHaveAttribute("data-state", "active");
    await expect($("h3=About")).toBeDisplayed();
    await expect($("h3=Tauri")).toBeDisplayed();

    const runtimeKind = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<string>("get_runtime_kind"),
    );
    expect(runtimeKind).toBe("wry");

    const status = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<E2eStatus>("e2e_status"),
    );
    expect(status.runId).toBe(process.env.DMM_E2E_RUN_ID);
    expect(status.caseId).toBe(process.env.DMM_E2E_CASE_ID);
    expect(status.applicationIdentity).toContain(".e2e.");
    expect(status.runtime).toBe(runtimeKind);
    expect(status.roots.world).toContain(".e2e");

    await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<void>("launch_game_direct", {
        additionalArgs: "--e2e-launch-probe",
      }),
    );
    expect(
      await browser.execute(() =>
        window.__TAURI_INTERNALS__.invoke<boolean>("is_game_running"),
      ),
    ).toBe(false);
    await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<void>("stop_game"),
    );

    const launchJournal = await readFile(
      path.join(status.roots.world, "artifacts", "game-launches.ndjson"),
      "utf8",
    );
    expect(launchJournal).toContain("--e2e-launch-probe");
    expect(launchJournal).toContain("steam.exe");

    if (process.env.DMM_E2E_INTENTIONAL_TIMEOUT === "1") {
      await browser.waitUntil(() => false, {
        timeout: 300,
        interval: 50,
        timeoutMsg: "intentional harness timeout",
      });
    }
  });
});
