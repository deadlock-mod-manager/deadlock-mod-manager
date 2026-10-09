import assert from "node:assert/strict";
import { $, $$, browser, expect } from "@wdio/globals";
import { step } from "./evidence";
import { observeUntil } from "./observations";
import { readShardStore } from "./shard-oracle";
import { navigate, openOrdering, reveal } from "./ui";

const card = (modId: string) =>
  `//*[@title="${modId}"]/ancestor::*[.//button[@role="switch"]][1]`;
export const modSwitch = (modId: string) =>
  $(`${card(modId)}//button[@role="switch"]`);

/** Linux paginates the library, so narrow it down before looking for a card. */
export const searchLibrary = async (query: string) => {
  const search = await $("#search");
  await search.waitForDisplayed();
  await search.setValue(query);
};
export const findMod = async (modId: string) => {
  await searchLibrary(modId);
  await reveal(await $(card(modId)));
};

export const setModEnabled = (world: string, modId: string, enabled: boolean) =>
  step(`${enabled ? "enable" : "disable"} ${modId}`, async () => {
    await findMod(modId);
    const control = await modSwitch(modId);
    await expect(control).toHaveAttribute("aria-checked", String(!enabled));
    await control.waitForClickable();
    await control.click();
    await observeUntil(
      `${modId} never became ${enabled ? "enabled" : "disabled"}`,
      () => readShardStore(world),
      (state) =>
        state.localMods.find((mod) => mod.remoteId === modId)?.status ===
          (enabled ? "installed" : "downloaded") &&
        (state.profiles[state.activeProfileId]?.enabledMods[modId]?.enabled ??
          false) === enabled,
    );
    await expect(modSwitch(modId)).toHaveAttribute(
      "aria-checked",
      String(enabled),
    );
  });

export const deleteMod = (world: string, modId: string) =>
  step(`delete ${modId}`, async () => {
    await findMod(modId);
    const remove = await $(`${card(modId)}//button[@aria-label="Remove mod"]`);
    await remove.waitForClickable();
    await remove.click();
    const confirm = await $('[role="alertdialog"]').$("button=Delete");
    await confirm.waitForClickable();
    await confirm.click();
    await observeUntil(
      `${modId} was never removed from the library`,
      () => readShardStore(world),
      (state) => !state.localMods.some((mod) => mod.remoteId === modId),
    );
    await expect($(`[title="${modId}"]`)).not.toExist();
  });

/** Fixture mods are named after their IDs. */
export const expectOrderingDialog = (order: readonly string[]) =>
  step("list the load order", async () => {
    await openOrdering();
    const names = await $$('[data-testid="ordered-mod-name"]').map((name) =>
      name.getText(),
    );
    assert.deepEqual(names, order);
    await browser.keys("Escape");
    await expect($('[role="dialog"]')).not.toBeDisplayed();
  });

const stat = (label: string) =>
  $(`//span[normalize-space()="${label}"]/following-sibling::span`);

export type ShardStatus = { shardsInUse: string; gameinfo: string };

export const openShardStatus = () =>
  step("open shard status", async () => {
    await navigate("developer");
    await $("button*=Resync").waitForDisplayed();
    // The report is cached between visits; read the disk as it is now.
    await $("button*=Refresh").click();
  });

export const expectShardStatus = (expected: ShardStatus) =>
  browser.waitUntil(
    async () =>
      (await stat("Shards in use").getText()) === expected.shardsInUse &&
      (await stat("gameinfo.gi").getText()) === expected.gameinfo,
    {
      timeoutMsg: `Shard status never showed ${JSON.stringify(expected)}`,
    },
  );
