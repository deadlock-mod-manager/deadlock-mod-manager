import { useQuery } from "@tanstack/react-query";
import { CommissionAuthorButton } from "@/components/mod-author/commission-author-button";
import { modAuthorQueryOptions } from "@/lib/mods/mod-author-query";

interface ModCommissionButtonProps {
  authorId: string;
}

export const ModCommissionButton = ({ authorId }: ModCommissionButtonProps) => {
  const { data: profile } = useQuery({
    ...modAuthorQueryOptions(authorId),
    meta: { skipGlobalErrorHandler: true },
    retry: 1,
  });
  return <CommissionAuthorButton author={profile?.author} />;
};
