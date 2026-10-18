import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import type { ModFile } from "../../src/types/mods";
import { catalogRecipe, CATALOG_MOD_NAME } from "./gamebanana-fixtures";
import { readCatalogState, assertCatalogDisk } from "./gamebanana-oracle";
import { observeUntil } from "./observations";
import {
  installedFiles,
  activeFiles,
  openFilesTab,
  reveal,
  selectDownloads,
} from "./ui";
import { step } from "./evidence";

export const waitCatalogStatus = (world: string, status: string) =>
  observeUntil(
    `Catalog status ${status}`,
    () => readCatalogState(world),
    (state) => state.localMods[0]?.status === status,
  );

type InstallFile = Pick<ModFile, "archive_name" | "path">;
const selectInstallFiles = async (files: InstallFile[]) => {
  const identities = new Set(
    files.map((file) => JSON.stringify([file.archive_name, file.path])),
  );
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  for (const row of await dialog.$$("[data-install-file]")) {
    const identity = await row.getAttribute("data-install-file");
    assert(identity);
    const checkbox = await row.$('[role="checkbox"]');
    const checked = (await checkbox.getAttribute("aria-checked")) === "true";
    if (checked !== identities.has(identity)) {
      const selector = await browser.execute(
        (value: string) => `[data-install-file="${CSS.escape(value)}"]`,
        identity,
      );
      await reveal(await dialog.$(selector));
      await row.click();
    }
    await expect(checkbox).toHaveAttribute(
      "aria-checked",
      String(identities.has(identity)),
    );
  }
  return dialog;
};

export const chooseInstallFiles = async (files: InstallFile[]) => {
  const dialog = await selectInstallFiles(files);
  await expect(dialog.$("button=Install Selected")).toBeEnabled();
  await dialog.$("button=Install Selected").click();
  await expect(dialog).not.toBeDisplayed();
};

export const installCatalog = (
  world: string,
  scenario: string,
  files: string[],
) =>
  step("download and install chosen catalog files", async () => {
    await $('button[aria-label="Download Mod"]').click();
    const recipe = catalogRecipe(scenario);
    const selected = recipe.filter((archive) => archive.selected);
    // Choosing among several downloads is remembered: enabling installs every
    // VPK in the chosen archives. Only a single download asks per VPK.
    const remembered = recipe.length > 1;
    if (remembered)
      await selectDownloads(selected.map((archive) => archive.name));
    await waitCatalogStatus(world, "downloaded");
    const toggle = await $('[role="switch"]');
    await toggle.waitForClickable();
    await toggle.click();
    if (scenario === "gamebanana-unremembered") {
      const dialog = await selectInstallFiles([]);
      await expect(dialog.$("button=Install Selected")).toBeDisabled();
      await dialog.$("button=Cancel").click();
      await waitCatalogStatus(world, "downloaded");
      await expect($('[role="switch"]')).toHaveAttribute(
        "aria-checked",
        "false",
      );
      const readyToggle = await $('[role="switch"]');
      await reveal(readyToggle);
      await readyToggle.waitForClickable();
      await readyToggle.click();
    }
    if (!remembered && selected.some((archive) => archive.files.length > 1)) {
      const tree = (await readCatalogState(world)).localMods[0]
        .installedFileTree;
      assert(tree);
      const selection = files.map((name) => {
        const matches = tree.files.filter((file) => file.name === name);
        assert.equal(
          matches.length,
          1,
          `Fixture filename must be unambiguous: ${name}`,
        );
        return matches[0];
      });
      await chooseInstallFiles(selection);
    }
    await waitCatalogStatus(world, "installed");
    await expect($('[role="switch"]')).toHaveAttribute("aria-checked", "true");
    await expect($('[role="dialog"]')).not.toBeDisplayed();
  });

export const checkCatalog = async (
  world: string,
  scenario: string,
  checkpoint: string,
  files: string[],
  downloads: string[],
  dormant: string[] = [],
) =>
  step(checkpoint, async () => {
    await observeUntil(
      "Persisted installed selection",
      () => readCatalogState(world),
      (state) => {
        const mod = state.localMods[0];
        return (
          mod?.status === "installed" &&
          state.profiles[state.activeProfileId].enabledMods[mod.remoteId]
            ?.enabled === true &&
          JSON.stringify(
            mod.installedFileTree?.files
              .filter((file) => file.is_selected)
              .map((file) => file.name)
              .sort(),
          ) === JSON.stringify(files.toSorted())
        );
      },
    );
    // The dialog only lists installed files when there is more than one.
    const tree = (await readCatalogState(world)).localMods[0].installedFileTree;
    if ((tree?.files.length ?? 0) > 1) {
      await openCatalogOptions();
      const installed = await installedFiles();
      await reveal(installed);
      await expect(installed).toBeDisplayed();
      assert.deepEqual(
        (
          await installed
            .$$('[data-selected="true"] [data-file-name]')
            .map((row) => row.getText())
        ).sort(),
        files.toSorted(),
      );
      const groups = catalogRecipe(scenario).filter((archive) =>
        archive.files.some((file) => files.includes(file)),
      );
      const activeGroups = await installed
        .$$("[data-archive]")
        .filter(
          async (group) =>
            (await group.getAttribute("data-selected-count")) !== "0",
        );
      assert.equal(activeGroups.length, groups.length);
      for (const archive of groups) {
        const group = await installed.$(`[data-archive="${archive.name}"]`);
        const names = archive.files
          .filter((file) => files.includes(file))
          .sort();
        assert.deepEqual(
          (
            await group
              .$$('[data-selected="true"] [data-file-name]')
              .map((row) => row.getText())
          ).sort(),
          names,
        );
        await expect(group).toHaveAttribute(
          "data-selected-count",
          String(names.length),
        );
      }
      await closeCatalogOptions();
    }
    await openFilesTab();
    const active = await activeFiles();
    await reveal(active);
    assert.deepEqual(
      (await active.$$("[data-file-name]").map((row) => row.getText())).sort(),
      (await readCatalogState(world)).localMods[0].installedVpks?.toSorted(),
    );
    await assertCatalogDisk(world, scenario, checkpoint, {
      files,
      downloads,
      dormant,
    });
  });

export const openCatalogOptions = async (modName = CATALOG_MOD_NAME) => {
  const button = await $("button=Manage files");
  await reveal(button);
  await button.click();
  const dialog = await $('[role="dialog"]');
  await expect(dialog).toHaveText(
    expect.stringContaining(`Manage Files: ${modName}`),
  );
  return dialog;
};

export const closeCatalogOptions = async () => {
  await browser.keys("Escape");
  await expect($('[role="dialog"]')).not.toBeDisplayed();
};

export const chooseArchives = async (names: string[]) => {
  const dialog = await $('[role="dialog"]');
  for (const row of await dialog.$$("[data-download-archive]")) {
    const name = await row.getAttribute("data-download-archive");
    assert(name);
    const checkbox = await row.$('[role="checkbox"]');
    if (
      ((await checkbox.getAttribute("aria-checked")) === "true") !==
      names.includes(name)
    ) {
      await reveal(await dialog.$(`[data-download-archive="${name}"]`));
      await row.click();
    }
    await expect(checkbox).toHaveAttribute(
      "aria-checked",
      String(names.includes(name)),
    );
  }
};

export const applyArchives = (names: string[]) =>
  step(`apply archives ${names.join(", ")}`, async () => {
    await openCatalogOptions();
    await chooseArchives(names);
    const dialog = await $('[role="dialog"]');
    await dialog.$("button=Apply").click();
    await expect(dialog).not.toBeDisplayed();
  });

export const chooseInstalledFiles = async (names: string[]) => {
  const installed = await installedFiles();
  await reveal(installed);
  for (const row of await installed.$$("[data-selected]")) {
    const name = await row.$("[data-file-name]").getText();
    if (
      ((await row.getAttribute("data-selected")) === "true") !==
      names.includes(name)
    )
      await row.click();
    await expect(row.$('[role="checkbox"]')).toHaveAttribute(
      "aria-checked",
      String(names.includes(name)),
    );
  }
  return installed;
};

export const applyInstalledFiles = (
  names: string[],
  modName = CATALOG_MOD_NAME,
) =>
  step(`apply installed files ${names.join(", ")}`, async () => {
    const dialog = await openCatalogOptions(modName);
    const installed = await chooseInstalledFiles(names);
    await installed.$("button=Apply").click();
    await expect(
      $('//*[@data-sonner-toast and contains(., "Mod files updated")]'),
    ).toBeDisplayed();
    await expect(dialog).not.toBeDisplayed();
  });

export const toggleCatalog = async (world: string, enabled: boolean) => {
  const toggle = await $('[role="switch"]');
  await reveal(toggle);
  await toggle.waitForClickable();
  await toggle.click();
  await expect($('[role="switch"]')).toHaveAttribute(
    "aria-checked",
    String(enabled),
  );
  await waitCatalogStatus(world, enabled ? "installed" : "downloaded");
  await expect($('[role="dialog"]')).not.toBeDisplayed();
};

export const reinstallCatalog = async (world: string, enabled: boolean) => {
  const button = await $('button[aria-label="Reinstall"]');
  await reveal(button);
  await button.click();
  const dialog = await $('[role="alertdialog"]');
  await expect(dialog).toHaveText(
    expect.stringContaining(`Reinstall ${CATALOG_MOD_NAME}?`),
  );
  await dialog.$("button=Reinstall").click();
  await expect(dialog).not.toBeDisplayed();
  await expect(
    $('//*[@data-sonner-toast and contains(., "reinstalled")]'),
  ).toBeDisplayed();
  await waitCatalogStatus(world, enabled ? "installed" : "downloaded");
};
