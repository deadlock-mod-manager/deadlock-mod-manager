import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import {
  getBackNavigation,
  type ModDetailNavigationState,
} from "@/lib/mods/mod-detail-navigation";

export const useModDetailNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const state: ModDetailNavigationState | null = location.state;
  const back = getBackNavigation(state ?? undefined);
  const collection = back.state.collection;
  const goBack = useCallback(
    () => navigate(back.path, { state: { collection } }),
    [back.path, collection, navigate],
  );

  return {
    collection,
    backLabel: t(back.labelKey, back.labelValues),
    goBack,
  };
};
