import { Suspense } from "react";
import { useParams } from "react-router";
import { AuthorNotFound } from "@/components/mod-author/author-not-found";
import { AuthorPageContent } from "@/components/mod-author/author-page-content";
import ErrorBoundary from "@/components/shared/error-boundary";
import { AuthorPageSkeleton } from "@/components/skeletons/author-page";
import { useModDetailNavigation } from "@/hooks/use-mod-detail-navigation";

const Author = () => {
  const params = useParams();
  const { backLabel, goBack } = useModDetailNavigation();
  const authorId = params.id?.trim();

  if (!authorId) {
    return <AuthorNotFound backLabel={backLabel} onBack={goBack} />;
  }

  return (
    <Suspense fallback={<AuthorPageSkeleton />}>
      <ErrorBoundary>
        <AuthorPageContent authorId={authorId} />
      </ErrorBoundary>
    </Suspense>
  );
};

export default Author;
