import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { detectOS } from "@/lib/os-detection";
import type { DetectedOS } from "@/types/releases";
import { orpc } from "@/utils/orpc";
import { DownloadsHero } from "./downloads-hero";
import { ErrorState } from "./error-state";
import { LatestRelease } from "./latest-release";
import { LoadingState } from "./loading-state";
import { ReleaseHistory } from "./release-history";

export const DownloadsContainer = () => {
  const [userOS, setUserOS] = useState<DetectedOS>("unknown");
  const {
    data: releases,
    isLoading,
    error,
  } = useQuery(orpc.getReleases.queryOptions());

  useEffect(() => {
    setUserOS(detectOS().os);
  }, []);

  if (error) {
    return <ErrorState />;
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!releases) {
    return <ErrorState />;
  }

  return (
    <>
      <DownloadsHero latest={releases.latest} />
      <div className='container mx-auto flex max-w-5xl flex-col gap-16 px-4 py-16'>
        <LatestRelease release={releases.latest} userOS={userOS} />
        <ReleaseHistory
          latestVersion={releases.latest.version}
          releases={releases.allVersions}
        />
      </div>
    </>
  );
};
