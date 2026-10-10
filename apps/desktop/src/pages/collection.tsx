import { Suspense } from "react";
import { useParams } from "react-router";
import { CollectionPageContent } from "@/components/collections/collection-page-content";
import ErrorBoundary from "@/components/shared/error-boundary";
import { AuthorPageSkeleton } from "@/components/skeletons/author-page";

const Collection = () => {
  const id = useParams().id?.trim() ?? "";

  return (
    <Suspense fallback={<AuthorPageSkeleton />}>
      <ErrorBoundary>
        <CollectionPageContent id={id} />
      </ErrorBoundary>
    </Suspense>
  );
};

export default Collection;
