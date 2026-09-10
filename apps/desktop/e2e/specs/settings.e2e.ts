import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { observeUntil } from "../support/observations";
import { reveal } from "../support/ui";
import {
  openSettings,
  setSwitch,
  selectSetting,
  moveSlider,
  readSettings,
} from "../support/settings-actions";

const applicationToggles = [
  { id: "toggle-setting-auto-update", key: "autoUpdateEnabled", value: true },
  { id: "toggle-setting-developer-mode", key: "developerMode", value: true },
  { id: "toggle-setting-ingest-tool", key: "ingestToolEnabled", value: true },
  {
    id: "toggle-setting-forge-install",
    key: "forgeInstallEnabled",
    value: true,
  },
  {
    id: "toggle-setting-model-preview",
    key: "foundry3dPreviewEnabled",
    value: false,
  },
  {
    id: "toggle-setting-multiple-skins",
    key: "multipleSkinsEnabled",
    value: true,
  },
  { id: "toggle-setting-hero-extras", key: "heroExtrasEnabled", value: true },
  {
    id: "toggle-animate-occult-geometry",
    key: "animateOccultGeometry",
    value: false,
  },
  {
    id: "toggle-show-occult-geometry",
    key: "showOccultGeometry",
    value: false,
  },
];
const systemToggles = [
  { id: "auto-reapply-mods", value: true },
  { id: "launch-vanilla-no-args", value: true },
  { id: "mods-store-pagination", value: true },
  { id: "hero-conflict-warning", value: false },
];
const privacyToggles = [
  { label: "Hide NSFW Content", key: "hideNSFW", value: true },
  { label: "Show Likely NSFW Content", key: "showLikelyNSFW", value: true },
  {
    label: "Remember Per-Item Choices",
    key: "rememberPerItemOverrides",
    value: false,
  },
];

describe("settings persistence", () => {
  it("applies preferences and renders them after restarting", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    const scenario = process.env.DMM_E2E_CASE_ID;
    const editing = phase === "configure";
    assert(editing || phase === "restart-settings");
    const checkpoint = path.join(world, "artifacts", "settings-process.json");
    if (!editing) {
      const prior = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, prior.processId);
    }
    if (scenario === "settings-application") {
      await openSettings("application");
      if (editing) {
        for (const control of systemToggles)
          await setSwitch(`#toggle-setting-${control.id}`, control.value);
        // Change animation before disabling the parent option.
        await setSwitch("#toggle-show-occult-geometry", true);
        for (const control of applicationToggles)
          await setSwitch(`#${control.id}`, control.value);
        await moveSlider('[role="slider"][aria-label="Audio Volume"]', 37);
        await selectSetting('[aria-label="Update Channel"]', "Nightly");
        const theme = await $('button[aria-label="Theme"]');
        await reveal(theme);
        await theme.click();
        await expect(theme).toBeFocused();
        await browser.keys("ArrowDown");
        await expect(theme).toHaveAttribute("aria-expanded", "true");
        await $('//*[@role="menuitem" and normalize-space()="Light"]').click();
      }
      for (const control of [
        ...applicationToggles,
        ...systemToggles.map((setting) => ({
          ...setting,
          id: `toggle-setting-${setting.id}`,
        })),
      ])
        await expect($(`#${control.id}`)).toHaveAttribute(
          "aria-checked",
          String(control.value),
        );
      await expect($("#toggle-animate-occult-geometry")).toBeDisabled();
      await expect($("html")).toHaveAttribute(
        "class",
        expect.stringContaining("light"),
      );
      await expect(
        $('[role="slider"][aria-label="Audio Volume"]'),
      ).toHaveAttribute("aria-valuenow", "37");
      await expect($('[aria-label="Update Channel"]')).toHaveText("Nightly");
      await observeUntil(
        "Application preferences persisted",
        () => readSettings(world),
        (state) => {
          const systems = z
            .record(z.string(), z.object({ enabled: z.boolean() }))
            .parse(state.settings);
          return (
            applicationToggles.every(
              (control) => state[control.key] === control.value,
            ) &&
            systemToggles.every(
              (control) => systems[control.id]?.enabled === control.value,
            ) &&
            state.audioVolume === 37
          );
        },
      );
    } else if (scenario === "settings-privacy") {
      await openSettings("privacy");
      if (editing) {
        for (const control of privacyToggles)
          await setSwitch(`[aria-label="${control.label}"]`, control.value);
        await setSwitch('[aria-label="Disable NSFW Blur"]', true);
        await expect(
          $('[role="slider"][aria-label="Blur Strength"]'),
        ).not.toBeDisplayed();
        await setSwitch('[aria-label="Disable NSFW Blur"]', false);
        await moveSlider('[role="slider"][aria-label="Blur Strength"]', 4);
        await setSwitch('[aria-label="Google Analytics"]', true);
      }
      for (const control of privacyToggles)
        await expect($(`[aria-label="${control.label}"]`)).toHaveAttribute(
          "aria-checked",
          String(control.value),
        );
      await expect(
        $('[role="slider"][aria-label="Blur Strength"]'),
      ).toHaveAttribute("aria-valuenow", "12");
      await expect($('[aria-label="Disable NSFW Blur"]')).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await observeUntil(
        "Privacy preferences persisted",
        () => readSettings(world),
        (state) => {
          const privacy = z
            .record(z.string(), z.json())
            .parse(state.nsfwSettings);
          const telemetry = z
            .object({ analyticsEnabled: z.boolean() })
            .parse(state.telemetrySettings);
          return (
            privacyToggles.every(
              (control) => privacy[control.key] === control.value,
            ) &&
            privacy.blurStrength === 12 &&
            privacy.disableBlur === false &&
            telemetry.analyticsEnabled
          );
        },
      );
    } else if (scenario === "settings-backups-presence") {
      await openSettings("backups");
      if (editing) {
        await setSwitch("#toggle-auto-backup", false);
        await selectSetting('[aria-label="Maximum backups to keep"]', "3");
      }
      await expect($("#toggle-auto-backup")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect($('[aria-label="Maximum backups to keep"]')).toHaveText("3");
      await openSettings("discord");
      if (editing) await setSwitch("#toggle-game-presence", false);
      await expect($("#toggle-game-presence")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await observeUntil(
        "Backup and presence preferences persisted",
        () => readSettings(world),
        (state) =>
          state.backupEnabled === false &&
          state.maxBackupCount === 3 &&
          state.gamePresenceEnabled === false,
      );
    } else {
      assert.equal(scenario, "settings-language");
      await openSettings("application");
      if (editing) await selectSetting("#settings-language", "Français");
      await expect($("#settings-language")).toHaveText(
        expect.stringContaining("Français"),
      );
      await expect($('[data-settings-tab="privacy"]')).not.toHaveText(
        "Privacy",
      );
    }
    const state = await readSettings(world);
    await writeFile(
      path.join(world, "artifacts", `settings-${phase}.json`),
      JSON.stringify(state, null, 2),
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `settings-${phase}.png`),
    );
    if (editing)
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    await closeApplication(world, runtime.processId);
    const closed = await readSettings(world);
    for (const key of [
      "settings",
      "nsfwSettings",
      "telemetrySettings",
      "audioVolume",
      "backupEnabled",
      "maxBackupCount",
      "gamePresenceEnabled",
      ...applicationToggles.map((control) => control.key),
    ])
      assert.deepEqual(closed[key], state[key], `Closing changed ${key}`);
  });
});
