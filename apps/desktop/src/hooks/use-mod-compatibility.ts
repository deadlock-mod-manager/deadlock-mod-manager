import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";

export const MOD_COMPATIBILITY_QUERY_KEY = ["mod-compatibility-enabled"];

export function useModCompatibility(profileFolder: string | null) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preference = useQuery({
    queryKey: MOD_COMPATIBILITY_QUERY_KEY,
    queryFn: () => invoke<boolean>("get_mod_compatibility_enabled"),
  });
  const changePreference = useMutation({
    mutationFn: (enabled: boolean) =>
      invoke<void>("set_mod_compatibility_enabled", { enabled, profileFolder }),
    onError: (error) => {
      toast.error(t("myMods.compatibility.changeFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: MOD_COMPATIBILITY_QUERY_KEY }),
  });
  return { preference, changePreference };
}
