import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { catalogRecipe, CATALOG_MOD_NAME } from "./gamebanana-fixtures";
import { readCatalogState, assertCatalogDisk } from "./gamebanana-oracle";
import { observeUntil } from "./observations";
import { installedFiles, activeFiles, reveal, selectDownloads } from "./ui";
import { step } from "./evidence";

export const waitCatalogStatus = (world: string, status: string) =>
  observeUntil(
    `Catalog status ${status}`,
    () => readCatalogState(world),
    (state) => state.localMods[0]?.status === status,
  );

export const chooseInstallFiles = async (names: string[]) => {
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  for (const row of await dialog.$$("[data-install-file]")) {
    const name = await row.getAttribute("data-install-file");
    assert(name);
    const checkbox = await row.$('[role="checkbox"]');
    const checked = (await checkbox.getAttribute("aria-checked")) === "true";
    if (checked !== names.includes(name)) {
      await reveal(dialog.$(`[data-install-file="${name}"]`));
      await row.click();
    }
    await expect(checkbox).toHaveAttribute(
      "aria-checked",
      String(names.includes(name)),
    );
  }
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
    if (recipe.length > 1)
      await selectDownloads(
        recipe
          .filter((archive) => archive.selected)
          .map((archive) => archive.name),
      );
    await waitCatalogStatus(world, "downloaded");
    const toggle = await $('[role="switch"]');
    await toggle.waitForClickable();
    await toggle.click();
    if (
      recipe
        .filter((archive) => archive.selected)
        .some((archive) => archive.files.length > 1)
    )
      await chooseInstallFiles(files);
    await waitCatalogStatus(world, "installed");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
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
    const installed = await installedFiles();
    await reveal(installed);
    await expect(installed).toBeDisplayed();
    assert.deepEqual(
      (
        await installed.$$("[data-file-name]").map((row) => row.getText())
      ).sort(),
      files.toSorted(),
    );
    const groups = catalogRecipe(scenario).filter((archive) =>
      archive.files.some((file) => files.includes(file)),
    );
    assert.equal((await installed.$$("[data-archive]")).length, groups.length);
    for (const archive of groups) {
      const group = await installed.$(`[data-archive="${archive.name}"]`);
      const names = archive.files.filter((file) => files.includes(file)).sort();
      assert.deepEqual(
        (await group.$$("[data-file-name]").map((row) => row.getText())).sort(),
        names,
      );
      await expect(group).toHaveText(
        expect.stringContaining(
          `${names.length} file${names.length === 1 ? "" : "s"}`,
        ),
      );
    }
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

export const openCatalogOptions = async () => {
  const button = await $("button=Manage files");
  await reveal(button);
  await button.click();
  const dialog = await $('[role="dialog"]');
  await expect(dialog).toHaveText(
    expect.stringContaining(`Manage Files: ${CATALOG_MOD_NAME}`),
  );
  return dialog;
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
      await reveal(dialog.$(`[data-download-archive="${name}"]`));
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

export const toggleCatalog = async (world: string, enabled: boolean) => {
  const toggle = await $('[role="switch"]');
  await reveal(toggle);
  await toggle.waitForClickable();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
  await waitCatalogStatus(world, enabled ? "installed" : "downloaded");
  await expect($('[role="dialog"]')).not.toBeDisplayed();
};

export const reinstallCatalog = async (world: string, enabled: boolean) => {
  const button = await $('button[aria-label="Reinstall"]');
  await reveal(button);
  await button.click();
  const dialog = await $('[role="dialog"]');
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
