import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useItemCatalog } from "@/hooks/use-player-stats";
import { resolveRank } from "@/lib/stats/api";
import type {
  CellValue,
  Dataset,
  DatasetField,
} from "@/lib/stats/dashboard/dataset";
import {
  formatClock,
  formatCompact,
  formatDayTick,
  formatDecimal,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";
import { useDashboardData } from "./dashboard-context";

/** "avg_net_worth" and "netWorth" both read as "Avg net worth" / "Net worth". */
const humanize = (key: string): string => {
  const spaced = key
    .replace(/[_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const SUNDAY = new Date(2024, 0, 7);

/**
 * Turns dataset cells into text. Ids resolve through the catalogs the page
 * already loads; the item catalog is only fetched once a dataset carries items.
 */
export const useFieldFormat = (dataset: Dataset) => {
  const { t, i18n } = useTranslation();
  const { heroesById, rankAssets } = useDashboardData();
  const needsItems = dataset.fields.some((field) => field.format === "item");
  const { itemsById } = useItemCatalog(needsItems);
  const locale = i18n.language;

  const fieldLabel = useCallback(
    (field: DatasetField | undefined) => {
      const key = field?.key ?? "";
      if (field?.labelKey) {
        return t(field.labelKey, { defaultValue: humanize(key) });
      }
      if (field?.label) {
        return field.label;
      }
      return t(`stats.dashboard.fields.${key}`, {
        defaultValue: humanize(key),
      });
    },
    [t],
  );

  const heroName = useCallback(
    (id: number) => heroesById.get(id)?.name ?? `#${id}`,
    [heroesById],
  );

  /** Short form for axes, legends and table cells. */
  const formatValue = useCallback(
    (value: CellValue | undefined, field: DatasetField | undefined): string => {
      if (value === null || value === undefined || value === "") {
        return "-";
      }
      if (typeof value === "string") {
        if (field?.format === "heroList") {
          return value
            .split(",")
            .map((id) => heroName(Number(id)))
            .join(" + ");
        }
        return field?.valueLabels
          ? t(`${field.valueLabels}.${value}`, {
              defaultValue: humanize(value),
            })
          : value;
      }
      switch (field?.format) {
        case "percent":
          return formatPercent(value, Math.abs(value) < 0.1 ? 1 : 0);
        case "signedPercent":
          return formatSignedPercent(value, 1);
        case "percentPoints":
          return `${Math.round(value)}%`;
        case "clock":
          return `${value < 0 ? "-" : ""}${formatClock(Math.abs(value))}`;
        case "minutes":
          return t("stats.dashboard.units.minutes", {
            value: formatDecimal(value, 1),
          });
        case "date":
          return formatDayTick(value, locale);
        case "hour":
          return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(
            new Date(2000, 0, 1, value),
          );
        case "weekday":
          return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
            new Date(
              SUNDAY.getFullYear(),
              SUNDAY.getMonth(),
              SUNDAY.getDate() + value,
            ),
          );
        case "hero":
          return heroName(value);
        case "item":
          return itemsById.get(value)?.name ?? `#${value}`;
        case "badge": {
          const rank = resolveRank(Math.round(value), rankAssets);
          return rank.name ? `${rank.name} ${rank.subrank}` : `#${value}`;
        }
        case "result":
          return value >= 0.5 ? t("stats.win") : t("stats.loss");
        case "session":
          return t("stats.charts.sessionTick", { position: value });
        case "durationBucket":
          return t("stats.dashboard.units.minuteRange", {
            from: value,
            to: value + 5,
          });
        case "integer":
        case "number":
          return formatCompact(value);
        case "decimal":
          return Math.abs(value) >= 1000
            ? formatCompact(value)
            : formatDecimal(value, Math.abs(value) >= 100 ? 0 : 2);
        default:
          return Number.isInteger(value)
            ? formatCompact(value)
            : formatDecimal(value, 2);
      }
    },
    [heroName, itemsById, locale, rankAssets, t],
  );

  return { fieldLabel, formatValue };
};
