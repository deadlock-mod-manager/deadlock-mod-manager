import { useForgeBridge } from "@/hooks/use-forge-bridge";
import { useForgeInstall } from "@/hooks/use-forge-install";
import { useForgeLaunchPrompt } from "@/hooks/use-forge-launch";

// Mounted inside the providers because the install listener needs the confirm
// dialog and the progress indicator, both of which App itself renders.
export const ForgeInstallRenderer = () => {
  useForgeBridge();
  useForgeInstall();
  useForgeLaunchPrompt();

  return null;
};
