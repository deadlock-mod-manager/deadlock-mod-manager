import { useTranslation } from "react-i18next";
import type {
  DashboardWidget,
  WidgetSource,
} from "@/lib/stats/dashboard/layout";

/** A name for the source, used whenever the user left the title empty. */
export const useSourceName = () => {
  const { t } = useTranslation();

  return (source: WidgetSource): string => {
    switch (source.kind) {
      case "panel":
        return t(`stats.dashboard.panels.${source.panel}.title`, {
          defaultValue: source.panel,
        });
      case "preset":
        return t(`stats.dashboard.presets.${source.preset}.title`, {
          defaultValue: source.preset,
        });
      case "matches": {
        const metrics = source.query.metrics
          .map((metric) => t(`stats.dashboard.fields.${metric}`))
          .join(", ");
        return source.query.groupBy === "none"
          ? metrics
          : t("stats.dashboard.matchQuery.titleGrouped", {
              metrics,
              group: t(
                `stats.dashboard.matchQuery.groups.${source.query.groupBy}`,
              ),
            });
      }
      case "api":
        return source.path.split("?")[0] || t("stats.dashboard.api.title");
    }
  };
};

export const useWidgetTitle = () => {
  const sourceName = useSourceName();
  return (widget: DashboardWidget): string =>
    widget.title.trim() || sourceName(widget.source);
};
