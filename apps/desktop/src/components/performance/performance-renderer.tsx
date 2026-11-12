import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import { ConfigFoundListener } from "./global/config-found-listener";
import { ReapplyFailedListener } from "./global/reapply-failed-listener";

export const PerformanceRenderer = () => {
  const isEnabled = useFeatureEnabled("performance");
  return (
    <>
      <ConfigFoundListener />
      {isEnabled && <ReapplyFailedListener />}
    </>
  );
};
