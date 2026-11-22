import assert from "node:assert/strict";
import { $, $$, browser, expect } from "@wdio/globals";
import { step } from "./evidence";
import { observeUntil } from "./observations";
import { readShardStore } from "./shard-oracle";
import { navigate, openOrdering, waitForClickable } from "./ui";

const card = (modId: string) =>
  `//*[@title="${modId}"]/ancestor::*[.//button[@role="switch"]][1]`;
const modSwitch = (modId: string) =>
  $(`${card(modId)}//button[@role="switch"]`);

/** Linux paginates the library, so narrow it down before looking for a card. */
export const searchLibrary = async (query: string) => {
  const search = await $("#search");
  await search.waitForDisplayed();
  await search.setValue(query);
};
// The debounced search re-sorts the grid after typing and React replaces the
// cards. A held node then never recovers on Windows or WebKitGTK, so these
// helpers look their element up again on every poll.
export const findMod = async (modId: string) => {
  await searchLibrary(modId);
  // Clicks land on screen coordinates, so wait until the card stops moving:
  // the same position on two polls, which are further apart than the debounce.
  let previous = "";
  await browser.waitUntil(
    async () => {
      const target = await $(card(modId));
      const position = await browser.execute((node: HTMLElement) => {
        node.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = node.getBoundingClientRect();
        return `${rect.left},${rect.top}`;
      }, target);
      const settled = position === previous;
      previous = position;
      return settled && target.isDisplayed({ withinViewport: true });
    },
    { timeoutMsg: `${modId} card did not settle in the viewport` },
  );
};

export const waitForSwitch = (
  modId: string,
  checked: boolean,
  clickable = false,
) =>
  browser.waitUntil(
    async () => {
      const control = await modSwitch(modId);
      return (
        (await control.getAttribute("aria-checked")) === String(checked) &&
        (!clickable || (await control.isClickable()))
      );
    },
    {
      timeoutMsg: `${modId} switch never showed aria-checked=${checked}${clickable ? " and clickable" : ""}`,
    },
  );

// On Windows the driver's el.click() now and then reaches a card button
// without running its handler. Click again only while nothing shows that the
// previous click landed, so a slow handler is never triggered twice.
const clickUntilLanded = async (
  selector: string,
  landed: () => Promise<boolean>,
  description: string,
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForClickable(selector);
    await $(selector).click();
    const registered = await browser
      .waitUntil(landed, { timeout: 3_000 })
      .catch(() => false);
    if (registered) return;
  }
  throw new Error(`${description} ignored three clicks`);
};

export const setModEnabled = (world: string, modId: string, enabled: boolean) =>
  step(`${enabled ? "enable" : "disable"} ${modId}`, async () => {
    await findMod(modId);
    await waitForSwitch(modId, !enabled, true);
    const toggle = `${card(modId)}//button[@role="switch"]`;
    // The switch is disabled while the toggle runs, then shows the new state.
    await clickUntilLanded(
      toggle,
      async () => {
        const control = await $(toggle);
        return (
          (await control.getAttribute("aria-checked")) === String(enabled) ||
          !(await control.isEnabled())
        );
      },
      `${modId} switch`,
    );
    await observeUntil(
      `${modId} never became ${enabled ? "enabled" : "disabled"}`,
      () => readShardStore(world),
      (state) =>
        state.localMods.find((mod) => mod.remoteId === modId)?.status ===
          (enabled ? "installed" : "downloaded") &&
        (state.profiles[state.activeProfileId]?.enabledMods[modId]?.enabled ??
          false) === enabled,
    );
    await waitForSwitch(modId, enabled);
  });

export const deleteMod = (world: string, modId: string) =>
  step(`delete ${modId}`, async () => {
    await findMod(modId);
    await clickUntilLanded(
      `${card(modId)}//button[@aria-label="Remove mod"]`,
      () => $('[role="alertdialog"]').isExisting(),
      `${modId} remove button`,
    );
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
