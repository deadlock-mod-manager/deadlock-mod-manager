import { type DashboardWidget } from "@/lib/stats/dashboard/layout";

export interface GridActions {
  onEdit: (widget: DashboardWidget) => void;
  onRemove: (widgetId: string) => void;
  onDuplicate: (widgetId: string) => void;
  onResize: (widgetId: string, size: Pick<DashboardWidget, "w" | "h">) => void;
  onReorder: (widgetId: string, targetId: string) => void;
  onMoveToTab: (widgetId: string, tabId: string) => void;
}
