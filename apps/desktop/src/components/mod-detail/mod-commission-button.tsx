import { useQuery } from "@tanstack/react-query";
import { CommissionAuthorButton } from "@/components/mod-author/commission-author-button";
import { modAuthorQueryOptions } from "@/lib/mods/mod-author-query";

interface ModCommissionButtonProps {
  authorId: string;
}

export const ModCommissionButton = ({ authorId }: ModCommissionButtonProps) => {
  // Same cache as the author card above, so this adds no request of its own.
  const { data: profile } = useQuery({
    ...modAuthorQueryOptions(authorId),
    meta: { skipGlobalErrorHandler: true },
    retry: 1,
  });
  return <CommissionAuthorButton author={profile?.author} />;
};
