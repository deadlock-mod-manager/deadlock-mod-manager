import assert from "node:assert/strict";
import path from "node:path";
import { $, $$, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_NAME } from "../support/gamebanana-fixtures";
import { openSettings } from "../support/settings-actions";
import { navigate, reveal, waitForDisplayed } from "../support/ui";

const row = (id: string) => $(`[data-check-id="${id}"]`);

describe("network diagnostics", () => {
  it("reports each failing check with what to do about it", async () => {
    const phase = z
      .enum(["autotuning", "internet-down"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    // A synced catalog keeps the catalog row from failing the run.
    await navigate("mods");
    await waitForDisplayed(`[title="${CATALOG_MOD_NAME}"]`);
    await openSettings("tools");

    await step("run the diagnostics", async () => {
      const button = await $("button=Diagnose connection");
      await reveal(button);
      await button.click();
      await browser.waitUntil(
        async () =>
          (await $$(
            '[data-check-status="pending"], [data-check-status="running"]',
          ).length) === 0,
        { timeout: 60_000, timeoutMsg: "The diagnostics never finished" },
      );
    });

    const statuses = await $$("[data-check-id]").map(async (check) => [
      await check.getAttribute("data-check-id"),
      await check.getAttribute("data-check-status"),
    ]);
    // Both Cloudflare probes go to the connectivity origin, which this phase
    // cuts off.
    const expectedFailures = new Set<string | null>(
      phase === "internet-down"
        ? ["internet", "dns", "tcpAutoTuning"]
        : ["tcpAutoTuning"],
    );
    const others = statuses.filter(([id]) => !expectedFailures.has(id));
    assert.deepEqual(
      others.filter(([, status]) => status !== "ok"),
      [],
      "Every other check must pass against the fixtures",
    );

    if (phase === "internet-down") {
      const internet = await row("internet");
      await reveal(internet);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "network-diagnostics-internet-down.png"),
      );
      assert.equal(await internet.getAttribute("data-check-status"), "error");
      assert.match(
        await internet.getText(),
        /127\.0\.0\.1:\d+ is not reachable/,
      );
    } else if (process.platform === "win32") {
      // Only Windows has the setting; the world injects Disabled.
      const autoTuning = await row("tcpAutoTuning");
      await reveal(autoTuning);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "network-diagnostics.png"),
      );
      assert.equal(
        await autoTuning.getAttribute("data-check-status"),
        "warning",
      );
      assert.match(await autoTuning.getText(), /auto-tuning is Disabled/);
      assert.match(
        await autoTuning.getText(),
        /netsh interface tcp set global autotuninglevel=normal/,
      );
    } else {
      await browser.saveScreenshot(
        path.join(world, "artifacts", "network-diagnostics.png"),
      );
      assert.equal(await row("tcpAutoTuning").isExisting(), false);
    }

    await closeApplication(world, runtime.processId);
  });
});
