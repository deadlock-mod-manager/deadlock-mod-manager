import type { ButtonProps } from "@deadlock-mods/ui/components/button";
import { getUpdatePercent } from "@/lib/mods/batch-update-progress";
import { usePersistedStore } from "@/lib/store";
import { UpdateButton } from "./update-button";

export const BatchUpdateButton = (props: Omit<ButtonProps, "icon">) => {
  const updatePercent = usePersistedStore((state) =>
    getUpdatePercent(state.batchUpdateProgress),
  );
  return <UpdateButton {...props} updatePercent={updatePercent} />;
};
