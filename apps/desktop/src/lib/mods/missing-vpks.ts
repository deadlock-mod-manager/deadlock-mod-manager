import { toast } from "@deadlock-mods/ui/components/sonner";
import { t } from "i18next";

/** Raised by the backend after a burst of VPK changes under the addons roots. */
export const ADDONS_CHANGED_EVENT = "addons-vpks-changed";

/** Tell the user which mods left the library because their files were deleted. */
export const notifyRemovedMods = (names: readonly string[]): void => {
  if (names.length === 0) return;
  toast.warning(
    t("warnings.removedMissingMods", {
      count: names.length,
      names: names.join(", "),
    }),
  );
};
