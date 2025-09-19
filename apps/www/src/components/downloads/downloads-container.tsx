import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { DownloadsHero } from "./downloads-hero";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { VersionAccordion } from "./version-accordion";

export const DownloadsContainer = () => {
  const {
    data: releases,
    isLoading,
    error,
  } = useQuery(orpc.getReleases.queryOptions());

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
      <DownloadsHero />
      <VersionAccordion releases={releases.allVersions} />
    </>
  );
};
