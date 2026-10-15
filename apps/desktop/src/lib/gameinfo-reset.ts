import type { QueryClient } from "@tanstack/react-query";

export const refreshGameinfoState = async (
  queryClient: Pick<QueryClient, "invalidateQueries">,
  setLastLaunchVanilla: (vanilla: boolean) => void,
): Promise<void> => {
  setLastLaunchVanilla(true);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["gameinfo-status"] }),
    queryClient.invalidateQueries({ queryKey: ["gameinfo-mod-paths"] }),
    queryClient.invalidateQueries({ queryKey: ["filesystem-writable"] }),
  ]);
};
