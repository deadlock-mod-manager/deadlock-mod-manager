import { usesAccount } from "@/lib/stats/dashboard/api-query";
import { presetById } from "@/lib/stats/dashboard/catalog";
import type { DashboardWidget } from "@/lib/stats/dashboard/layout";
import { panelDef } from "./panels";

export const widgetNeedsAccount = (widget: DashboardWidget): boolean => {
  switch (widget.source.kind) {
    case "panel":
      return panelDef(widget.source.panel)?.needsAccount ?? false;
    case "preset":
      return presetById(widget.source.preset)?.needsAccount ?? false;
    case "matches":
      return true;
    case "api":
      return usesAccount(widget.source.path);
  }
};

export const widgetNeedsHistory = (widget: DashboardWidget): boolean => {
  switch (widget.source.kind) {
    case "panel":
      return panelDef(widget.source.panel)?.needsHistory ?? false;
    case "preset":
      return presetById(widget.source.preset)?.needsHistory ?? false;
    case "matches":
      return true;
    case "api":
      return false;
  }
};
