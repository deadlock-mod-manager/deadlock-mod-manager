import { useForgeBridge } from "@/hooks/use-forge-bridge";
import { useForgeInstall } from "@/hooks/use-forge-install";
import { useForgeLaunchPrompt } from "@/hooks/use-forge-launch";

export const ForgeInstallRenderer = () => {
  useForgeBridge();
  useForgeInstall();
  useForgeLaunchPrompt();

  return null;
};
