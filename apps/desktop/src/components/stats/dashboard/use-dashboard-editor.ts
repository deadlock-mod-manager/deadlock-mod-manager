import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  addTab,
  cloneLayout,
  type DashboardLayout,
  type DashboardTab,
  type DashboardWidget,
  DEFAULT_LAYOUT,
  duplicateWidget,
  moveTab,
  moveWidgetToTab,
  parseLayout,
  removeTab,
  removeWidget,
  reorderWidget,
  resizeWidget,
  type TabIcon,
  updateTab,
  upsertWidget,
} from "@/lib/stats/dashboard/layout";
import { emptyTab, tabFromTemplate } from "@/lib/stats/dashboard/templates";
import { usePersistedStore } from "@/lib/store";
import type { GridActions } from "./dashboard-grid";
import type { WidgetHealth } from "./dashboard-widget";

export type PendingConfirm =
  | { kind: "reset" }
  | { kind: "discard" }
  | { kind: "deleteTab"; tab: DashboardTab };

type EditorTarget = { tabId: string; widget: DashboardWidget | null };

/**
 * The dashboard's layout and its editing session. Edits go to a draft, so the
 * saved layout only changes on Save; destructive steps wait for confirmation.
 */
export const useDashboardEditor = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const storedLayout = usePersistedStore((state) => state.statsDashboard);
  const setStoredLayout = usePersistedStore((state) => state.setStatsDashboard);
  const { layout: savedLayout, recovered } = useMemo(
    () => parseLayout(storedLayout),
    [storedLayout],
  );

  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [health, setHealth] = useState<Record<string, WidgetHealth>>({});

  const editing = draft !== null;
  const layout = draft ?? savedLayout;
  const tabParam = searchParams.get("tab");
  const activeTab =
    layout.tabs.find((tab) => tab.id === tabParam) ?? layout.tabs[0];
  const isDirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(savedLayout);

  const selectTab = (tabId: string) =>
    setSearchParams({ tab: tabId }, { replace: true });

  const edit = (change: (current: DashboardLayout) => DashboardLayout) =>
    setDraft((current) => (current ? change(current) : current));

  const reportHealth = useCallback(
    (widgetId: string, next: WidgetHealth) =>
      setHealth((current) =>
        current[widgetId] === next ? current : { ...current, [widgetId]: next },
      ),
    [],
  );

  const brokenTabIds = new Set(
    layout.tabs
      .filter((tab) =>
        tab.widgets.some((widget) => health[widget.id] === "broken"),
      )
      .map((tab) => tab.id),
  );

  const tabId = activeTab.id;
  const gridActions: GridActions = {
    onEdit: (widget) => setEditorTarget({ tabId, widget }),
    onRemove: (widgetId) =>
      edit((current) => removeWidget(current, tabId, widgetId)),
    onDuplicate: (widgetId) =>
      edit((current) => duplicateWidget(current, tabId, widgetId)),
    onResize: (widgetId, size) =>
      edit((current) => resizeWidget(current, tabId, widgetId, size)),
    onReorder: (widgetId, targetId) =>
      edit((current) => reorderWidget(current, tabId, widgetId, targetId)),
    onMoveToTab: (widgetId, target) =>
      edit((current) => moveWidgetToTab(current, tabId, widgetId, target)),
  };

  const tabActions = {
    onAddTab: (templateId: string | null) => {
      if (!draft) return;
      const title = t(
        templateId
          ? `stats.dashboard.templates.${templateId}`
          : "stats.dashboard.tabs.untitled",
      );
      const tab = templateId
        ? tabFromTemplate(templateId, draft, title)
        : emptyTab(title);
      if (!tab) return;
      setDraft(addTab(draft, tab));
      selectTab(tab.id);
    },
    onDeleteTab: (tab: DashboardTab) =>
      tab.widgets.length === 0
        ? edit((current) => removeTab(current, tab.id))
        : setPendingConfirm({ kind: "deleteTab", tab }),
    onMoveTab: (id: string, offset: -1 | 1) =>
      edit((current) => moveTab(current, id, offset)),
    onRenameTab: (id: string, title: string) =>
      edit((current) =>
        updateTab(current, id, { title: title.trim() || null }),
      ),
    onTabIcon: (id: string, icon: TabIcon) =>
      edit((current) => updateTab(current, id, { icon })),
  };

  return {
    layout,
    activeTab,
    selectTab,
    editing,
    isDirty,
    recovered,
    brokenTabIds,
    reportHealth,
    gridActions,
    tabActions,
    startEditing: () => setDraft(cloneLayout(savedLayout)),
    save: () => {
      if (!draft) return;
      // Saving the untouched default stores nothing, so later releases can
      // still improve the default for everyone who never customised it.
      setStoredLayout(
        JSON.stringify(draft) === JSON.stringify(DEFAULT_LAYOUT) ? null : draft,
      );
      setDraft(null);
    },
    cancel: () =>
      isDirty ? setPendingConfirm({ kind: "discard" }) : setDraft(null),
    requestReset: () => setPendingConfirm({ kind: "reset" }),

    editorTarget,
    addWidget: () => setEditorTarget({ tabId, widget: null }),
    closeEditor: () => setEditorTarget(null),
    saveWidget: (widget: DashboardWidget) => {
      if (editorTarget) {
        edit((current) => upsertWidget(current, editorTarget.tabId, widget));
      }
      setEditorTarget(null);
    },

    pendingConfirm,
    dismissConfirm: () => setPendingConfirm(null),
    confirm: () => {
      if (pendingConfirm?.kind === "reset") {
        setDraft(cloneLayout(DEFAULT_LAYOUT));
      } else if (pendingConfirm?.kind === "discard") {
        setDraft(null);
      } else if (pendingConfirm?.kind === "deleteTab" && draft) {
        const remaining = removeTab(draft, pendingConfirm.tab.id);
        setDraft(remaining);
        if (remaining.tabs[0]) selectTab(remaining.tabs[0].id);
      }
      setPendingConfirm(null);
    },
  };
};
