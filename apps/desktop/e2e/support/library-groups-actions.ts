import assert from "node:assert/strict";
import { $, $$, browser, expect } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";
import { nativeInput } from "./native-input";
import { readLibraryGroups } from "./library-groups-oracle";
import { observeUntil } from "./observations";
import { ALPHA } from "./profile-fixtures";
import { waitForOverlaysClosed } from "./ui";

export const group = (name: string) =>
  $(`section[data-mod-group][aria-label="${name}"]`);
export const groupHeader = (name: string) =>
  group(name).$("[data-mod-group-header]");
export const groupToggle = (name: string) =>
  groupHeader(name).$("button[aria-expanded]");

export const createGroup = async (name: string) => {
  await browser.waitUntil(() => $("button=Groups").isEnabled());
  await $("button=Groups").click();
  await browser.keys("ArrowDown");
  await $('[role="menuitem"]=New group').click();
  await $('input[placeholder="e.g. Map cosmetics"]').setValue(name);
  await $("button=Create group").click();
  await expect(group(name)).toBeDisplayed();
  // The fading overlay still covers the page, so native input would hit it.
  await expect($('[role="dialog"]')).not.toBeExisting();
  await expect(
    $('//div[@data-state and contains(@class, "bg-black/80")]'),
  ).not.toBeExisting();
};
export const groupMenu = async (name: string, action: string) => {
  const trigger = group(name).$(`button[aria-label="Actions for ${name}"]`);
  await waitForOverlaysClosed();
  await trigger.click();
  await browser.keys("ArrowDown");
  await $(`[role="menuitem"]=${action}`).click();
};
export const groupTools = async (action: string) => {
  await waitForOverlaysClosed();
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

type ProbeWindow = Window & { dragProbe?: string[] };

// Records which element each native pointer event reaches, so a drag that
// never starts shows whether the press or the moves went missing.
const startDragProbe = () =>
  browser.execute(() => {
    const probe: string[] = [];
    (window as ProbeWindow).dragProbe = probe;
    for (const type of ["pointerdown", "pointermove", "pointerup", "mousedown"])
      document.addEventListener(
        type,
        (event) => {
          if (probe.length >= 40 || !(event instanceof MouseEvent)) return;
          const target =
            event.target instanceof Element
              ? `${event.target.tagName.toLowerCase()}${event.target.id ? `#${event.target.id}` : ""}.${event.target.className}`
              : String(event.target);
          probe.push(
            `${type} (${event.clientX},${event.clientY}) buttons=${event.buttons} prevented=${event.defaultPrevented} ${target.slice(0, 120)}`,
          );
        },
        { capture: true },
      );
  });

const readDragProbe = () =>
  browser.execute(() => (window as ProbeWindow).dragProbe ?? []);

export const nativeGroupDrag = async (
  source: ChainablePromiseElement,
  target: () => ChainablePromiseElement,
  whileHovering?: () => Promise<void>,
) => {
  await revealDragTarget(source);
  await startDragProbe();
  await nativeInput("pointer-down", source);
  try {
    await nativeInput("pointer-move", source, undefined, { x: 12, y: 0 });
    try {
      await $("[data-library-drag-preview]").waitForDisplayed();
    } catch (error) {
      throw new Error(
        [
          "Drag never started. Events the page received:",
          ...(await readDragProbe()),
        ].join("\n"),
        { cause: error },
      );
    }
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
