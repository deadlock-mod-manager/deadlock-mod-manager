import { $, $$, browser, expect } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";
import { z } from "zod";
import { step } from "./evidence";
import { readPersistedDocument } from "./observations";
import { navigate, waitForDisplayed } from "./ui";

export const DEFAULT_TAB_IDS = ["overview", "heroes", "items", "squad", "live"];
export const DEFAULT_TAB_TITLES = [
  "Overview",
  "Heroes",
  "Items",
  "Squad",
  "Live",
];
export const DEFAULT_OVERVIEW = [
  "tiles",
  "insights",
  "form",
  "session",
  "rank",
  "recentMatches",
];

const savedLayoutSchema = z.object({
  state: z.object({
    statsDashboard: z
      .object({
        tabs: z.array(
          z.object({
            id: z.string(),
            title: z.string().nullable(),
            icon: z.string(),
            widgets: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                w: z.number(),
                source: z.object({
                  kind: z.string(),
                  preset: z.string().optional(),
                  panel: z.string().optional(),
                  path: z.string().optional(),
                }),
                view: z
                  .object({ chart: z.string(), y: z.array(z.string()) })
                  .optional(),
              }),
            ),
          }),
        ),
      })
      .nullable()
      .optional(),
  }),
});

export type SavedLayout = NonNullable<
  z.infer<typeof savedLayoutSchema>["state"]["statsDashboard"]
>;

export const readSavedLayout = async (world: string) =>
  savedLayoutSchema.parse(await readPersistedDocument(world)).state
    .statsDashboard ?? null;

/** What a saved widget shows, as one comparable string per widget. */
export const describeWidgets = (
  layout: SavedLayout | null,
  tabId: string,
): string[] =>
  layout?.tabs
    .find((tab) => tab.id === tabId)
    ?.widgets.map(
      (widget) =>
        widget.source.preset ??
        widget.source.panel ??
        `${widget.source.kind}:${widget.source.path ?? ""}`,
    ) ?? [];

export const tabTrigger = (id: string) => $(`[data-tab-id="${id}"]`);
export const tabByTitle = (title: string) =>
  $(`//button[@role="tab" and normalize-space()="${title}"]`);

export const tabIds = async () =>
  Promise.all(
    await $$("[data-tab-id]").map((tab) => tab.getAttribute("data-tab-id")),
  );

export const tabTitles = async () =>
  Promise.all(await $$("[data-tab-id]").map((tab) => tab.getText()));

export const selectTab = (title: string) =>
  step(`select the ${title} tab`, async () => {
    const tab = await tabByTitle(title);
    await tab.waitForClickable();
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");
  });

/**
 * The active tab's title, looked up fresh on every poll: the embedded driver
 * keeps evaluating a node React has replaced instead of reporting it stale.
 */
export const expectActiveTab = (title: string) =>
  browser.waitUntil(
    async () =>
      (await $('[data-tab-id][data-state="active"]').getText()) === title,
    { timeoutMsg: `the "${title}" tab never became active` },
  );

/** Sources of the widgets on the visible tab, in grid order. */
export const widgetSources = async () =>
  Promise.all(
    await $$("[data-widget-source]").map((widget) =>
      widget.getAttribute("data-widget-source"),
    ),
  );

export const widget = (source: string) => $(`[data-widget-source="${source}"]`);
export const widgetById = (id: string) => $(`[data-widget-id="${id}"]`);

export const waitForWidgetState = (
  container: ChainablePromiseElement,
  state: "ready" | "broken" | "empty" | "loading" | "needsAccount",
) =>
  browser.waitUntil(
    async () =>
      (await container
        .$("[data-widget-state]")
        .getAttribute("data-widget-state")) === state,
    { timeoutMsg: `widget never reached state "${state}"` },
  );

/**
 * The world's WebView detects the host's language, and number formats follow
 * it (3,63 on a German Windows). Pin English, so assertions hold on any host
 * and survive community translations of the dashboard strings.
 */
const pinEnglish = async () => {
  const language = await browser.execute(() =>
    localStorage.getItem("i18nextLng"),
  );
  if (language === "en") return;
  await browser.execute(() => localStorage.setItem("i18nextLng", "en"));
  await browser.refresh();
  await $('a[href="/stats"]').waitForClickable();
};

export const openStats = (tabs = DEFAULT_TAB_IDS) =>
  step("open stats", async () => {
    await pinEnglish();
    await navigate("stats");
    for (const id of tabs) await waitForDisplayed(`[data-tab-id="${id}"]`);
    await expect(tabTrigger(tabs[0] ?? "overview")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

export const startEditing = () =>
  step("enter edit mode", async () => {
    const customize = await $('[data-testid="stats-customize"]');
    await customize.waitForClickable();
    await customize.click();
    await waitForDisplayed('[data-testid="stats-save"]');
  });

export const saveLayout = () =>
  step("save the layout", async () => {
    const save = await $('[data-testid="stats-save"]');
    await save.waitForEnabled();
    await save.click();
    await waitForDisplayed('[data-testid="stats-customize"]');
  });

export const confirmAlert = (action: string) =>
  step(`confirm "${action}"`, async () => {
    const dialog = await $('[role="alertdialog"]');
    await dialog.waitForDisplayed();
    await dialog.$(`button=${action}`).click();
    await expect(dialog).not.toBeDisplayed();
  });

export const resetToDefault = () =>
  step("reset to the default layout", async () => {
    await startEditing();
    await $('[data-testid="stats-reset"]').click();
    await confirmAlert("Reset");
    await saveLayout();
  });

const menuItem = (label: string) =>
  $(`//*[@role="menuitem" and normalize-space()="${label}"]`);

/**
 * Radix menus open on pointerdown, which a WebDriver click does not deliver
 * reliably; like the ordering menu elsewhere in the suite, focus the trigger
 * and open it from the keyboard.
 */
export const openMenu = async (trigger: ChainablePromiseElement) => {
  await trigger.waitForClickable();
  await trigger.click();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await expect(trigger).toBeFocused();
    await browser.keys("ArrowDown");
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
};

/** Picks a menu entry; an entry with a submenu is opened from the keyboard. */
const pickMenuItem = async (label: string, opensSubmenu: boolean) => {
  const item = await menuItem(label);
  await item.waitForDisplayed();
  if (!opensSubmenu) {
    await item.click();
    return;
  }
  await item.moveTo();
  if ((await item.getAttribute("aria-expanded")) !== "true") {
    await item.click();
  }
  if ((await item.getAttribute("aria-expanded")) !== "true") {
    await browser.keys("ArrowRight");
  }
  await expect(item).toHaveAttribute("aria-expanded", "true");
};

/** Opens a widget's "…" menu and picks an entry, following a submenu if given. */
export const useWidgetMenu = (
  container: ChainablePromiseElement,
  path: readonly string[],
) =>
  step(`widget menu: ${path.join(" > ")}`, async () => {
    await openMenu(container.$('button[aria-label="Widget options"]'));
    for (const [index, label] of path.entries()) {
      await pickMenuItem(label, index < path.length - 1);
    }
    await expect($('[role="menu"]')).not.toBeExisting();
  });

/**
 * Replaces a field's text the way a person does: focus, erase, type. WebDriver's
 * clear blurs the field, which closes a Radix popover around it, and element
 * send-keys appends. `field` is a lookup, so every check sees the live node.
 */
export const typeOver = async (
  field: () => ChainablePromiseElement,
  value: string,
) => {
  await field().click();
  const current = await field().getValue();
  await browser.keys("End");
  await browser.keys(Array.from({ length: current.length }, () => "Backspace"));
  await browser.keys(value);
  await browser.waitUntil(async () => (await field().getValue()) === value, {
    timeoutMsg: `field never read "${value}"`,
  });
};

export const editorDialog = () => $('[role="dialog"]');

export const openWidgetEditor = () =>
  step("open the widget editor", async () => {
    const add = await $('[data-testid="stats-add-widget"]');
    await add.waitForClickable();
    await add.click();
    await editorDialog().waitForDisplayed();
  });

export const chooseSourceMode = (
  mode: "presets" | "matches" | "api" | "panels",
) =>
  step(`use the ${mode} source`, async () => {
    const button = await editorDialog().$(`[data-source-mode="${mode}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  });

export const choosePreset = (preset: string, search: string) =>
  step(`pick the ${preset} preset`, async () => {
    const dialog = await editorDialog();
    await dialog.$('input[placeholder="Search values…"]').setValue(search);
    const option = await dialog.$(`[data-preset-id="${preset}"]`);
    await option.waitForClickable();
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  });

/** Waits for the preview to show data, then switches the chart type. */
export const chooseChart = (chart: string) =>
  step(`draw it as ${chart}`, async () => {
    const dialog = await editorDialog();
    await waitForWidgetState(dialog, "ready");
    const button = await dialog.$(`[data-chart-type="${chart}"]`);
    await button.waitForEnabled();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  });

export const setWidgetTitle = (title: string) =>
  step(`title it "${title}"`, async () => {
    await typeOver(() => editorDialog().$('input[aria-label="Title"]'), title);
  });

export const setWidgetWidth = (label: string) =>
  step(`make it ${label}`, async () => {
    const option = await editorDialog().$(
      `//*[@aria-label="Width"]//*[normalize-space()="${label}"]`,
    );
    await option.click();
    await expect(option).toHaveAttribute("data-state", "on");
  });

export const submitEditor = () =>
  step("apply the widget", async () => {
    const save = await editorDialog().$('[data-testid="widget-editor-save"]');
    await save.waitForEnabled();
    await save.click();
    await expect(editorDialog()).not.toBeDisplayed();
  });

/** A table widget's header and rows as rendered text. */
export const readTable = async (container: ChainablePromiseElement) => {
  await container.$("table").waitForDisplayed();
  const header = await Promise.all(
    await container.$$("thead th").map((cell) => cell.getText()),
  );
  const rows = await Promise.all(
    await container
      .$$("tbody tr")
      .map(async (row) =>
        Promise.all(await row.$$("td").map((cell) => cell.getText())),
      ),
  );
  return { header, rows };
};

/**
 * Hero cells lead with the avatar's fallback initial, so a first cell matches
 * when it ends with the expected label; every other cell must match exactly.
 */
export const expectTable = async (
  container: ChainablePromiseElement,
  header: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
) => {
  await browser.waitUntil(
    async () => (await container.$$("tbody tr").length) === rows.length,
    { timeoutMsg: `table never showed ${rows.length} rows` },
  );
  const table = await readTable(container);
  expect(table.header).toEqual([...header]);
  expect(
    table.rows.map((cells, rowIndex) =>
      cells.map((text, index) =>
        index === 0 && text.trim().endsWith(rows[rowIndex]?.[0] ?? "")
          ? (rows[rowIndex]?.[0] ?? text)
          : text.trim(),
      ),
    ),
  ).toEqual(rows.map((row) => [...row]));
};
