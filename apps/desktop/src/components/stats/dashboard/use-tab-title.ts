import { useTranslation } from "react-i18next";
import {
  DEFAULT_TAB_IDS,
  type DashboardTab,
} from "@/lib/stats/dashboard/layout";

/** Built-in tabs keep following the app language until the user renames them. */
export const useTabTitle = () => {
  const { t } = useTranslation();
  return (tab: DashboardTab): string =>
    tab.title?.trim() ||
    (DEFAULT_TAB_IDS.has(tab.id)
      ? t(`stats.tabs.${tab.id}`)
      : t("stats.dashboard.tabs.untitled"));
};
