import assert from "node:assert/strict";
import { chmod, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { readBrokenLaunches } from "../support/broken-state-oracle";
import { step } from "../support/evidence";
import { RECOVERY_MOD } from "../support/gameinfo-recovery-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA, profilePayload } from "../support/profile-fixtures";
import { openSettings, setSwitch } from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

describe("gameinfo and addons recovery", () => {
  it("recovers in the same process and preserves installed payloads", async () => {
    const runtime = await startApplication();
    const { world } = runtime.roots;
    const {
      configuration: {
        roots: { game, steam, appData },
      },
    } = await assertOwnedWorld(world);
    const citadel = path.join(game, "game", "citadel");
    const gameinfo = path.join(citadel, "gameinfo.gi");
    const addons = path.join(citadel, "addons");
    const profile = path.join(addons, ALPHA.folder);
    const steamBefore = await collectFileInventory(steam);
    const sourcesBefore = await collectFileInventory(
      path.join(appData, "mods"),
    );
    const protectedBefore = await readFile(path.join(citadel, "protected.txt"));
    await navigate("my-mods");
    assert.equal((await readBrokenLaunches(world)).length, 0);

    if (runtime.caseId === "gameinfo-readonly-launch") {
      await step(
        "Show the exact read-only file and repair before one launch",
        async () => {
          await chmod(gameinfo, 0o444);
          try {
            await $("button*=Launch modded").click();
            const dialog = await $('[data-testid="readonly-file-dialog"]');
            await dialog.waitForDisplayed();
            assert.equal(
              path.normalize(
                await $('[data-testid="readonly-file-path"]').getText(),
              ),
              gameinfo,
            );
            await expect($('[data-testid="make-file-writable"]')).toHaveText(
              "Make writable",
            );
            assert.equal((await readBrokenLaunches(world)).length, 0);
            await browser.saveScreenshot(
              path.join(world, "artifacts", "readonly-error.png"),
            );
            await $('[data-testid="make-file-writable"]').click();
            await dialog.waitForDisplayed({ reverse: true });
            await observeUntil(
              "Exactly one launch after repair",
              () => readBrokenLaunches(world),
              (rows) => rows.length === 1,
            );
            assert.notEqual((await stat(gameinfo)).mode & 0o200, 0);
          } finally {
            await chmod(gameinfo, 0o666);
          }
        },
      );
    } else if (runtime.caseId === "addons-missing-enable") {
      await step(
        "Recreate a missing addons tree while enabling a local mod",
        async () => {
          await setSwitch('main [role="switch"]', false);
          const relative = path.relative(game, addons);
          assert(
            relative &&
              !relative.startsWith("..") &&
              !path.isAbsolute(relative),
          );
          await rm(addons, { recursive: true });
          await setSwitch('main [role="switch"]', true);
          await observeUntil(
            "Restored local VPK",
            async () => readFile(path.join(profile, "pak01_dir.vpk")),
            (bytes) => bytes.equals(profilePayload(RECOVERY_MOD)),
          );
          assert((await stat(addons)).isDirectory());
        },
      );
    } else {
      assert.equal(runtime.caseId, "gameinfo-reset-live");
      await setSwitch('main [role="switch"]', false);
      await setSwitch('main [role="switch"]', true);
      await step(
        "Report a parse failure and reset through Settings without restarting",
        async () => {
          await writeFile(gameinfo, "broken gameinfo\n");
          await openSettings("game");
          const validate = await $("button=Validate Configuration");
          await reveal(validate);
          await validate.click();
          await expect($("body")).toHaveText(
            expect.stringContaining("Failed to parse game configuration"),
          );
          const reset = await $("button=Reset to Vanilla");
          await reveal(reset);
          await reset.click();
          const confirm = await $('[role="alertdialog"] button[type="submit"]');
          await confirm.waitForClickable();
          await confirm.click();
          await observeUntil(
            "Vanilla reset applied",
            () => readFile(gameinfo, "utf8"),
            (content) =>
              content.includes("SearchPaths") &&
              !content.includes("citadel/addons"),
          );
          await expect($("body")).toHaveText(
            expect.stringContaining(
              "gameinfo.gi reset to vanilla using the downloaded file",
            ),
          );
          await navigate("my-mods");
          await $("button*=Launch modded").click();
          await observeUntil(
            "One launch without restarting DMM",
            () => readBrokenLaunches(world),
            (rows) => rows.length === 1,
          );
        },
      );
    }

    const verify = async () => {
      assert.deepEqual(
        await readFile(path.join(profile, "pak01_dir.vpk")),
        profilePayload(RECOVERY_MOD),
      );
      const manifest = await readFile(path.join(profile, ".dmm.json"), "utf8");
      assert.match(manifest, new RegExp(RECOVERY_MOD));
      assert.match(manifest, /"enabled": true/);
      if (runtime.caseId !== "addons-missing-enable") {
        assert.match(
          await readFile(gameinfo, "utf8"),
          new RegExp(`Game\\s+citadel/addons/${ALPHA.folder}`),
        );
      }
      assert.equal(
        (await readBrokenLaunches(world)).length,
        runtime.caseId === "addons-missing-enable" ? 0 : 1,
      );
      assert.deepEqual(
        await readFile(path.join(citadel, "protected.txt")),
        protectedBefore,
      );
      assert.deepEqual(await collectFileInventory(steam), steamBefore);
      assert.deepEqual(
        await collectFileInventory(path.join(appData, "mods")),
        sourcesBefore,
      );
    };
    await verify();
    const final = await collectFileInventory(profile);
    await closeApplication(world, runtime.processId);
    await verify();
    assert.deepEqual(await collectFileInventory(profile), final);
  });
});
