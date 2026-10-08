import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { ConfigFoundListener } from "./global/config-found-listener";
import { ReapplyFailedListener } from "./global/reapply-failed-listener";

export const PerformanceRenderer = () => {
  const isEnabled = useExperimentalFeature("performance-configs");
  if (!isEnabled) return null;
  return (
    <>
      <ConfigFoundListener />
      <ReapplyFailedListener />
    </>
  );
};
