import { describe, expect, it } from "bun:test";
import {
  type DashboardLayout,
  type DashboardWidget,
  DEFAULT_LAYOUT,
  moveTab,
  moveWidgetToTab,
  parseLayout,
  removeTab,
  reorderWidget,
  upsertWidget,
} from "./layout";

const widget = (id: string): DashboardWidget => ({
  id,
  title: "",
  w: 6,
  h: 4,
  source: { kind: "preset", preset: "you.summary", params: {} },
});

const layout: DashboardLayout = {
  version: 1,
  tabs: [
    {
      id: "a",
      title: "A",
      icon: "chart",
      widgets: [widget("1"), widget("2"), widget("3")],
    },
    { id: "b", title: "B", icon: "star", widgets: [] },
  ],
};

const ids = (value: DashboardLayout, tabId: string) =>
  value.tabs.find((tab) => tab.id === tabId)?.widgets.map((entry) => entry.id);

describe("dashboard layout", () => {
  it("falls back to the default for a layout that no longer parses", () => {
    // Type-valid, but the schema wants at least one tab.
    const broken: DashboardLayout = { version: 1, tabs: [] };
    expect(parseLayout(broken)).toEqual({
      layout: DEFAULT_LAYOUT,
      recovered: true,
    });
  });

  it("keeps unknown preset ids so the widget can report itself broken", () => {
    const future = structuredClone(layout);
    future.tabs[0]?.widgets.push({
      ...widget("4"),
      source: { kind: "preset", preset: "removed.someday", params: {} },
    });
    expect(parseLayout(future).recovered).toBe(false);
  });

  it("moves a widget onto another widget's slot", () => {
    expect(ids(reorderWidget(layout, "a", "3", "1"), "a")).toEqual([
      "3",
      "1",
      "2",
    ]);
    expect(ids(reorderWidget(layout, "a", "1", "3"), "a")).toEqual([
      "2",
      "3",
      "1",
    ]);
  });

  it("moves a widget to another tab", () => {
    const next = moveWidgetToTab(layout, "a", "2", "b");
    expect(ids(next, "a")).toEqual(["1", "3"]);
    expect(ids(next, "b")).toEqual(["2"]);
  });

  it("replaces an existing widget and appends a new one", () => {
    const edited = upsertWidget(layout, "a", { ...widget("2"), title: "x" });
    expect(edited.tabs[0]?.widgets[1]?.title).toBe("x");
    expect(ids(upsertWidget(layout, "a", widget("9")), "a")).toEqual([
      "1",
      "2",
      "3",
      "9",
    ]);
  });

  it("never removes the last tab", () => {
    const single = removeTab(layout, "b");
    expect(single.tabs).toHaveLength(1);
    expect(removeTab(single, "a").tabs).toHaveLength(1);
  });

  it("moves tabs within bounds", () => {
    expect(moveTab(layout, "a", 1).tabs.map((tab) => tab.id)).toEqual([
      "b",
      "a",
    ]);
    expect(moveTab(layout, "a", -1)).toBe(layout);
  });
});
