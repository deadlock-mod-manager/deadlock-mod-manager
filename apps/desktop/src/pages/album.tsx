import { Suspense } from "react";
import { useParams } from "react-router";
import { AlbumPageContent } from "@/components/albums/album-page-content";
import ErrorBoundary from "@/components/shared/error-boundary";
import { AuthorPageSkeleton } from "@/components/skeletons/author-page";

const Album = () => {
  const slug = useParams().slug?.trim() ?? "";

  return (
    <Suspense fallback={<AuthorPageSkeleton />}>
      <ErrorBoundary>
        <AlbumPageContent slug={slug} />
      </ErrorBoundary>
    </Suspense>
  );
};

export default Album;
