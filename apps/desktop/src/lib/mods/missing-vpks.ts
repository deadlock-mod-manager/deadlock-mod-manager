import { toast } from "@deadlock-mods/ui/components/sonner";
import { t } from "i18next";

export const ADDONS_CHANGED_EVENT = "addons-vpks-changed";

export const notifyRemovedMods = (names: readonly string[]): void => {
  if (names.length === 0) return;
  toast.warning(
    t("warnings.removedMissingMods", {
      count: names.length,
      names: names.join(", "),
    }),
  );
};
