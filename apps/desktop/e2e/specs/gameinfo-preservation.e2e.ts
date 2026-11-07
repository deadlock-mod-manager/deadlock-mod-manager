import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { readBrokenLaunches } from "../support/broken-state-oracle";
import { step } from "../support/evidence";
import { startFakeGame, stopFakeGame } from "../support/fake-game";
import {
  HYPERLINE_PATHS,
  LEGACY_GAMEINFO,
  PRESERVED_GAMEINFO,
} from "../support/gameinfo-preservation-fixtures";
import { VANILLA_GAMEINFO } from "../support/gameinfo-recovery-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA, BETA, profilePayload } from "../support/profile-fixtures";
import { openSettings, setSwitch } from "../support/settings-actions";
import { activateProfile, navigate } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const cleanupSearchPaths = async () => {
  const result = await browser.execute(async () => {
    // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const revision = await invoke<number | null>("gameinfo_cleanup_revision");
    const running = await invoke<boolean>("is_game_running");
    const removed =
      revision !== null &&
      (await invoke<boolean>("remove_mod_search_paths", {
        expectedRevision: revision,
      }));
    return {
      revision,
      running,
      removed,
      currentRevision: await invoke<number | null>("gameinfo_cleanup_revision"),
    };
  });
  assert(
    result.removed,
    `Cleanup must remove the current mounts: ${JSON.stringify(result)}`,
  );
  return true;
};

describe("coexistence with other gameinfo editors", () => {
  it("preserves foreign mounts through launches, profile changes, cleanup, and restart", async () => {
    const runtime = await startApplication();
    const { world } = runtime.roots;
    const {
      configuration: {
        roots: { game, steam },
      },
    } = await assertOwnedWorld(world);
    const citadel = path.join(game, "game", "citadel");
    const gameinfo = path.join(citadel, "gameinfo.gi");
    const checkpoint = path.join(
      world,
      "artifacts",
      "preservation-process.json",
    );
    const steamBefore = await collectFileInventory(steam);
    const restarting = process.env.DMM_E2E_PHASE === "restart-preserve";
    if (restarting) {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(previous.processId, runtime.processId);
    }
    const assertPreserved = async () => {
      const content = await readFile(gameinfo, "utf8");
      assert(content.includes(HYPERLINE_PATHS));
      assert(content.startsWith('\uFEFF"GameInfo"\r\n'));
      assert(
        content.endsWith(
          '  ConVars { "fps_max" "240" } // User performance settings\r\n}',
        ),
      );
      assert(!content.replaceAll("\r\n", "").includes("\n"));
      assert(!content.includes("server_stale"));
      return content;
    };
    await navigate("my-mods");
    const recordLaunch = async (vanilla: boolean) => {
      const count = (await readBrokenLaunches(world)).length;
      const button = await $(
        vanilla ? "button=Launch without mods" : "button*=Launch modded",
      );
      await button.waitForClickable();
      await button.click();
      await observeUntil(
        "one recorded launch",
        () => readBrokenLaunches(world),
        (rows) => rows.length === count + 1,
      );
      await $("button=Cancel launch").waitForExist({ reverse: true });
      await button.waitForClickable();
    };
    const launch = async (vanilla: boolean, folder: string) => {
      await recordLaunch(vanilla);
      const content = await assertPreserved();
      if (vanilla) assert.equal(content, PRESERVED_GAMEINFO);
      else
        assert.match(
          content,
          new RegExp(`Game\\s+citadel/addons/${folder}\\s+// dmm-search-path`),
        );
      return content;
    };

    await step(
      "Keep both Hyperline blocks while enabling and reapplying DMM paths",
      async () => {
        const first = await launch(false, ALPHA.folder);
        const timestamp = (await stat(gameinfo)).mtimeMs;
        const revision = await browser.execute(() =>
          // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
          window.__TAURI_INTERNALS__.invoke<number | null>(
            "gameinfo_cleanup_revision",
          ),
        );
        assert.notEqual(revision, null);
        assert.equal(await launch(false, ALPHA.folder), first);
        assert.equal((await stat(gameinfo)).mtimeMs, timestamp);
        const removed = await browser.execute(
          (expectedRevision) =>
            // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
            window.__TAURI_INTERNALS__.invoke<boolean>(
              "remove_mod_search_paths",
              { expectedRevision },
            ),
          revision,
        );
        assert.equal(removed, false);
        assert.equal(await readFile(gameinfo, "utf8"), first);
        if (runtime.caseId === "gameinfo-preserve-legacy-search-paths") {
          const snapshots = (await readdir(citadel)).filter((name) =>
            name.startsWith("gameinfo.gi.pre-dmm-migration-"),
          );
          assert.equal(snapshots.length, 1);
          assert.equal(
            await readFile(path.join(citadel, snapshots[0]), "utf8"),
            LEGACY_GAMEINFO,
          );
        }
      },
    );
    await step(
      "Replace only DMM profile paths, then launch without DMM mounts",
      async () => {
        await activateProfile(BETA.name);
        const beta = await launch(false, BETA.folder);
        assert(!beta.includes(`citadel/addons/${ALPHA.folder}`));
        await launch(true, BETA.folder);
      },
    );
    await step(
      "Reject broken syntax without resetting the file or launching",
      async () => {
        const count = (await readBrokenLaunches(world)).length;
        for (const broken of [
          PRESERVED_GAMEINFO.slice(0, -1),
          `${PRESERVED_GAMEINFO}}`,
        ]) {
          await writeFile(gameinfo, broken);
          await $("button*=Launch modded").click();
          await expect($("body")).toHaveText(
            expect.stringContaining("Failed to parse game configuration"),
          );
          assert.equal(await readFile(gameinfo, "utf8"), broken);
          assert.equal((await readBrokenLaunches(world)).length, count);
        }
        const malformedMarkers = PRESERVED_GAMEINFO.replace(
          "      Game core",
          "      // Deadlock Mod Manager - SearchPaths v2 - Start\r\n      Game core",
        );
        await writeFile(gameinfo, malformedMarkers);
        await $("button*=Launch modded").click();
        await expect($("body")).toHaveText(
          expect.stringContaining("DMM search-path markers are incomplete"),
        );
        assert.equal(await readFile(gameinfo, "utf8"), malformedMarkers);
        assert.equal((await readBrokenLaunches(world)).length, count);
        // Emulate Steam replacing the file while the same manager still has setup cached.
        await writeFile(gameinfo, PRESERVED_GAMEINFO);
        await launch(false, BETA.folder);
      },
    );
    await step(
      "Run the exit-cleanup IPC and preserve every non-DMM byte",
      async () => {
        await cleanupSearchPaths();
        assert.equal(await readFile(gameinfo, "utf8"), PRESERVED_GAMEINFO);
        await activateProfile(ALPHA.name);
        await launch(false, ALPHA.folder);
      },
    );
    await step(
      "Remove only DMM mounts after an opted-in game exit",
      async () => {
        await openSettings("game");
        await setSwitch("#toggle-setting-auto-reset-gameinfo", true);
        await navigate("my-mods");
        const mounted = await readFile(gameinfo, "utf8");
        const game = await startFakeGame(world);
        try {
          await expect($("button=Stop Game")).toBeDisplayed({ wait: 15_000 });
          assert.equal(await readFile(gameinfo, "utf8"), mounted);
        } finally {
          await stopFakeGame(game);
        }
        await observeUntil(
          "the exit hook removes DMM mounts while preserving foreign content",
          () => readFile(gameinfo, "utf8"),
          (content) => content === PRESERVED_GAMEINFO,
          20_000,
        );
        await expect($("body")).toHaveText(
          expect.stringContaining("Deadlock closed. DMM mod paths removed."),
        );
        await openSettings("game");
        await setSwitch("#toggle-setting-auto-reset-gameinfo", false);
        await navigate("my-mods");
        await launch(false, ALPHA.folder);
      },
    );
    await step(
      "Preserve Deadworks mounts and engine defaults through profile launches and cleanup",
      async () => {
        const upstream = await readFile(
          new URL(
            "../../src-tauri/src/mod_manager/gameinfo_search_paths/fixtures/deadworks-after-dmm.gi",
            import.meta.url,
          ),
          "utf8",
        );
        const [deadworksBlock] =
          upstream.match(
            /\/\/ Deadworks Launcher - Start[\s\S]*?\/\/ Deadworks Launcher - End/,
          ) ?? [];
        assert(deadworksBlock);
        await writeFile(gameinfo, upstream);
        const assertDeadworks = async () => {
          const content = await readFile(gameinfo, "utf8");
          assert(content.includes(deadworksBlock));
          for (const target of [
            "citadel/deadworks_mods",
            "citadel/deadworks_addons",
          ]) {
            assert.equal(content.split(target).length - 1, 1);
          }
          assert.match(content, /Mod\s+"citadel" \/\/ dmm-search-path/);
          assert.match(content, /Write\s+"citadel" \/\/ dmm-search-path/);
          return content;
        };
        await recordLaunch(false);
        const mounted = await assertDeadworks();
        assert(mounted.includes(`citadel/addons/${ALPHA.folder}`));
        assert(
          mounted.indexOf("citadel/deadworks_mods") <
            mounted.indexOf(`citadel/addons/${ALPHA.folder}`),
        );
        await cleanupSearchPaths();
        const cleaned = await assertDeadworks();
        assert(!cleaned.includes("citadel/addons"));
        const status = await browser.execute(() =>
          // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
          window.__TAURI_INTERNALS__.invoke<{
            is_modified_by_mod_manager: boolean;
            has_mod_paths: boolean;
            syntax_valid: boolean;
          }>("get_gameinfo_status"),
        );
        assert.equal(status.is_modified_by_mod_manager, true);
        assert.equal(status.has_mod_paths, false);
        assert.equal(status.syntax_valid, true);
        const timestamp = (await stat(gameinfo)).mtimeMs;
        await recordLaunch(true);
        assert.equal(await assertDeadworks(), cleaned);
        assert.equal((await stat(gameinfo)).mtimeMs, timestamp);
        await recordLaunch(false);
        await assertDeadworks();
        await writeFile(gameinfo, PRESERVED_GAMEINFO);
        await launch(false, ALPHA.folder);
      },
    );
    await step(
      "Handle compact mounts and opening-brace comments without splitting foreign fences",
      async () => {
        for (const original of [
          "GameInfo { FileSystem { SearchPaths { // shared mounts\n Game citadel\n Game core\n} } }",
          "GameInfo { FileSystem { SearchPaths { Game_UILanguage citadel_*LANGUAGE* Game_LowViolence citadel_lv Game citadel Game core } } }",
        ]) {
          await writeFile(gameinfo, original);
          await recordLaunch(false);
          const mounted = await readFile(gameinfo, "utf8");
          assert(mounted.includes(`citadel/addons/${ALPHA.folder}`));
          if (original.includes("Game_LowViolence")) {
            assert(
              mounted.indexOf("Game_LowViolence") <
                mounted.indexOf(`citadel/addons/${ALPHA.folder}`),
            );
          }
          assert(await cleanupSearchPaths());
          assert.equal(await readFile(gameinfo, "utf8"), original);
        }
        const blocked =
          "GameInfo\n{ FileSystem\n { SearchPaths\n  {\n   // Other tool BEGIN\n   Game_UILanguage citadel_*LANGUAGE*\n   Game citadel\n   // Other tool END\n   Game core\n  }\n }\n}";
        await writeFile(gameinfo, blocked);
        const count = (await readBrokenLaunches(world)).length;
        await $("button*=Launch modded").click();
        await expect($("body")).toHaveText(
          expect.stringContaining(
            "preserves both language priority and the foreign block",
          ),
        );
        assert.equal(await readFile(gameinfo, "utf8"), blocked);
        assert.equal((await readBrokenLaunches(world)).length, count);
        await writeFile(gameinfo, PRESERVED_GAMEINFO);
        await launch(false, ALPHA.folder);
      },
    );
    await step(
      "Keep platform-specific defaults conditional and profiles ahead of stock mounts",
      async () => {
        const conditional = PRESERVED_GAMEINFO.replace(
          HYPERLINE_PATHS,
          [
            "      Mod linux_mod [$LINUX]",
            "      Write linux_write [$LINUX]",
          ].join("\r\n"),
        );
        await writeFile(gameinfo, conditional);
        await recordLaunch(false);
        const mounted = await readFile(gameinfo, "utf8");
        assert.match(mounted, /Mod\s+"citadel" \/\/ dmm-search-path/);
        assert.match(mounted, /Write\s+"citadel" \/\/ dmm-search-path/);
        assert(mounted.includes("Mod linux_mod [$LINUX]"));
        assert(mounted.includes("Write linux_write [$LINUX]"));
        await cleanupSearchPaths();
        assert.equal(await readFile(gameinfo, "utf8"), conditional);
        const unknown = conditional.replaceAll("$LINUX", "$CUSTOM");
        await writeFile(gameinfo, unknown);
        await recordLaunch(true);
        assert.equal(await readFile(gameinfo, "utf8"), unknown);

        const foreignBlock = [
          "      // Other tool BEGIN",
          "      Game citadel/deadworks_mods",
          "      Mod citadel",
          "      Write citadel",
          "      Game citadel",
          "      // Other tool END",
        ].join("\r\n");
        const fenced = PRESERVED_GAMEINFO.replace(
          `${HYPERLINE_PATHS}\r\n      Game citadel`,
          foreignBlock,
        );
        await writeFile(gameinfo, fenced);
        await recordLaunch(false);
        const prioritized = await readFile(gameinfo, "utf8");
        assert(prioritized.includes(foreignBlock));
        const profile = prioritized.indexOf(`citadel/addons/${ALPHA.folder}`);
        assert(profile >= 0);
        assert(prioritized.indexOf("citadel/deadworks_mods") < profile);
        assert(profile < prioritized.indexOf("      Game citadel\r\n"));
        await cleanupSearchPaths();
        assert.equal(await readFile(gameinfo, "utf8"), fenced);
        await writeFile(gameinfo, PRESERVED_GAMEINFO);
        await launch(false, ALPHA.folder);
      },
    );
    for (const { profile, modId } of [
      { profile: ALPHA, modId: "local-alpha-one" },
      { profile: BETA, modId: "local-beta-one" },
    ]) {
      assert.deepEqual(
        await readFile(
          path.join(citadel, "addons", profile.folder, "pak01_dir.vpk"),
        ),
        profilePayload(modId),
      );
    }
    assert.equal(
      await readFile(path.join(citadel, "gameinfo.gi.bak"), "utf8"),
      VANILLA_GAMEINFO,
    );
    assert.deepEqual(await collectFileInventory(steam), steamBefore);
    await writeFile(
      checkpoint,
      JSON.stringify({ processId: runtime.processId }),
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `preservation-${runtime.processId}.png`),
    );
    await closeApplication(world, runtime.processId);
    await assertPreserved();
  });
});
