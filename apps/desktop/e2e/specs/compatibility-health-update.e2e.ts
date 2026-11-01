import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  HEALTH_MOD,
  HEALTH_PROFILE,
  UPDATED_PAYLOAD,
} from "../support/health-update-fixtures";
import { observeUntil } from "../support/observations";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

type ModHealthReport = { mods: { modId: string; status: string }[] };

// Reads the saved report the badge and the launch read. Calling
// check_mod_health here would run the check this case expects the app to run.
const readHealth = async () => {
  const report = await browser.execute(
    (folder) =>
      window["__TAURI_INTERNALS__"].invoke<ModHealthReport>("get_mod_health", {
        profileFolder: folder,
      }),
    HEALTH_PROFILE.folder,
  );
  return report.mods.find((health) => health.modId === HEALTH_MOD.id)?.status;
};

const readAddon = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    HEALTH_PROFILE.folder,
  );
  const manifest = z
    .object({
      mods: z.record(
        z.string(),
        z.object({ currentVpks: z.array(z.string()) }),
      ),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
    );
  return {
    vpks: manifest.mods[HEALTH_MOD.id]?.currentVpks,
    bytes: await readFile(path.join(directory, "pak01_dir.vpk")),
  };
};

const readLaunchCount = async (world: string) =>
  readFile(path.join(world, "artifacts", "game-launches.ndjson"), "utf8").then(
    (text) => text.trim().split("\n").filter(Boolean).length,
    () => 0,
  );

const card = () => $(`[data-library-mod="${HEALTH_MOD.id}"]`);
const text = (value: string, scope = "") =>
  $(`${scope}//*[contains(normalize-space(text()), "${value}")]`);
const badge = () =>
  text("Can be fixed", `//*[@data-library-mod="${HEALTH_MOD.id}"]`);
const toast = (text: string) =>
  $(`//*[@data-sonner-toast and contains(., "${text}")]`);

describe("mod health after a mod update", () => {
  it("rechecks an updated mod without a restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("check the installed version", async () => {
      assert.equal(
        await observeUntil(
          "initial health check",
          readHealth,
          (status) => status !== undefined,
          30_000,
        ),
        "works",
      );
      await card().waitForDisplayed();
      await expect(badge()).not.toBeExisting();
    });

    await step("update the mod from a loose VPK", async () => {
      const check = await $('button[aria-label="Check for updates"]');
      await check.waitForEnabled({ timeout: 30_000 });
      await check.click();
      await expect(toast("1 update available")).toBeDisplayed({
        wait: 30_000,
      });
      await $("button=1 update available").click();
      const update = await $('[role="dialog"]').$("button*=Update");
      await update.waitForEnabled();
      await update.click();
      const addon = await observeUntil(
        "updated files installed",
        () => readAddon(world),
        ({ bytes }) => bytes.equals(UPDATED_PAYLOAD),
        30_000,
      );
      // The update kept the VPK name, so only the files' contents changed.
      assert.deepEqual(addon.vpks, ["pak01_dir.vpk"]);
    });

    await step("recheck the updated mod", async () => {
      assert.equal(
        await observeUntil(
          "updated mod rechecked",
          readHealth,
          (status) => status === "fixable",
          30_000,
        ),
        "fixable",
      );
      await expect(badge()).toBeDisplayed({ wait: 10_000 });
      await expect(
        text("1 mod was made for an older Deadlock version"),
      ).toBeDisplayed();
    });

    await step("offer the fix before launch", async () => {
      const launches = await readLaunchCount(world);
      const launch = await $("button*=Launch modded");
      await launch.waitForClickable();
      await launch.click();
      const prompt = await $('[role="dialog"]');
      await expect(prompt).toHaveText(
        expect.stringContaining("1 enabled mod was made for an older version"),
        { wait: 10_000 },
      );
      await browser.keys("Escape");
      await prompt.waitForDisplayed({ reverse: true });
      assert.equal(await readLaunchCount(world), launches);
    });

    await browser.saveScreenshot(
      path.join(world, "artifacts", "health-after-update.png"),
    );
    await closeApplication(world, runtime.processId);
  });
});
