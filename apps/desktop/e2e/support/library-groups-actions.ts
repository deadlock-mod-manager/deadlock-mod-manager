import assert from "node:assert/strict";
import { $, $$, browser, expect } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";
import { nativeInput } from "./native-input";
import { readLibraryGroups } from "./library-groups-oracle";
import { observeUntil } from "./observations";
import { ALPHA } from "./profile-fixtures";

export const group = (name: string) =>
  $(`section[data-mod-group][aria-label="${name}"]`);
export const groupHeader = (name: string) =>
  group(name).$("[data-mod-group-header]");
export const groupToggle = (name: string) =>
  groupHeader(name).$("button[aria-expanded]");

export const createGroup = async (name: string) => {
  await browser.waitUntil(() => $("button=Groups").isEnabled());
  await $("button=Groups").click();
  await $('[role="menuitem"]=New group').click();
  await $('input[placeholder="e.g. Map cosmetics"]').setValue(name);
  await $("button=Create group").click();
  await expect(group(name)).toBeDisplayed();
};
export const groupMenu = async (name: string, action: string) => {
  const trigger = group(name).$(`button[aria-label="Actions for ${name}"]`);
  await trigger.click();
  await browser.keys("ArrowDown");
  await $(`[role="menuitem"]=${action}`).click();
};
export const groupTools = async (action: string) => {
  await $("button=Groups").click();
  await browser.keys("ArrowDown");
  await $(`[role="menuitem"]=${action}`).click();
};
export const selectMods = async (ids: readonly string[]) => {
  const done = $('button[aria-label="Done selecting"]');
  if (await done.isExisting()) await done.click();
  for (const id of ids) {
    const checkbox = $(`[role="checkbox"][aria-label="Select ${id}"]`);
    await checkbox.moveTo();
    await checkbox.click();
  }
};
export const moveSelected = async (name: string) => {
  await $("button=Move to group").click();
  await browser.keys("ArrowDown");
  await $(`[role="menuitem"]=${name}`).click();
};
export const expectMembership = async (
  world: string,
  expected: Record<string, string[]>,
  profileId = ALPHA.id,
) =>
  observeUntil(
    "group membership persisted",
    async () => {
      const state = await readLibraryGroups(world);
      return Object.fromEntries(
        state.profiles[profileId].modGroups.map((entry) => [
          entry.name,
          entry.modIds.toSorted(),
        ]),
      );
    },
    (actual) => {
      try {
        assert.deepEqual(
          actual,
          Object.fromEntries(
            Object.entries(expected).map(([name, ids]) => [
              name,
              ids.toSorted(),
            ]),
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
  );
export const expectGroupOrder = async (names: string[]) => {
  await expect($$("section[data-mod-group]")).toBeElementsArrayOfSize(
    names.length,
  );
  const actual = await $$("section[data-mod-group]").map((element) =>
    element.getAttribute("aria-label"),
  );
  assert.deepEqual(actual, names);
};

const revealDragTarget = async (element: ChainablePromiseElement) => {
  await browser.execute(
    (node: HTMLElement) =>
      node.scrollIntoView({ block: "center", behavior: "instant" }),
    await element,
  );
  await browser.waitUntil(() => element.isDisplayed({ withinViewport: true }));
};

export const nativeGroupDrag = async (
  source: ChainablePromiseElement,
  target: () => ChainablePromiseElement,
  whileHovering?: () => Promise<void>,
) => {
  await revealDragTarget(source);
  await nativeInput("pointer-down", source);
  try {
    await nativeInput("pointer-move", source, undefined, { x: 12, y: 0 });
    await $("[data-library-drag-preview]").waitForDisplayed();
    await revealDragTarget(target());
    await nativeInput("pointer-move", target());
    if (whileHovering) await whileHovering();
    const rectangle = await target().getLocation();
    const size = await target().getSize();
    const preview = await $("[data-library-drag-preview]").getLocation();
    assert(
      Math.abs(preview.x - (rectangle.x + size.width / 2)) < 25,
      "Drag preview is too far from the pointer",
    );
    assert(
      Math.abs(preview.y - (rectangle.y + size.height / 2)) < 25,
      "Drag preview is too far from the pointer",
    );
    await nativeInput("pointer-up", target());
  } finally {
    await nativeInput("pointer-up", source);
  }
  await expect($("[data-library-drag-preview]")).not.toBeDisplayed();
};
