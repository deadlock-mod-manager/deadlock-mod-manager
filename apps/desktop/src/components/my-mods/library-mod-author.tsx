import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getMod } from "@/lib/api-client";
import {
  findModInModsListCache,
  modDetailQueryKey,
} from "@/lib/mods/mod-query-cache";
import { parseSubmissionSlug } from "@/lib/mods/submission-ref";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { LocalMod } from "@/types/mods";

export const LibraryModAuthor = ({
  mod,
}: {
  mod: Pick<LocalMod, "remoteId" | "author" | "modAuthorId">;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openProfile = useMutation({
    mutationFn: async () => {
      if (mod.modAuthorId) return mod.modAuthorId;
      const cached = findModInModsListCache(queryClient, mod.remoteId);
      if (cached?.modAuthorId) return cached.modAuthorId;
      const details = await queryClient.fetchQuery({
        queryKey: modDetailQueryKey(mod.remoteId),
        queryFn: () => getMod(mod.remoteId),
        staleTime: STALE_TIME_API,
        retry: 1,
        meta: { skipGlobalErrorHandler: true },
      });
      return details.modAuthorId;
    },
    onSuccess: (authorId) => {
      if (!authorId) {
        toast.warning(t("authorPage.notFoundTitle"));
        return;
      }
      navigate(`/authors/${authorId}`, {
        state: { collection: "library" },
      });
    },
  });

  if (
    !mod.modAuthorId &&
    parseSubmissionSlug(mod.remoteId)?.provider !== "gamebanana"
  ) {
    return (
      <span title={mod.author}>
        {t("mods.by")} {mod.author}
      </span>
    );
  }

  const label = t("mods.showMoreByAuthor", { author: mod.author });
  return (
    <button
      aria-label={label}
      aria-busy={openProfile.isPending}
      disabled={openProfile.isPending}
      className='max-w-full truncate rounded-sm text-left text-muted-foreground text-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60'
      onClick={(event) => {
        event.stopPropagation();
        openProfile.mutate();
      }}
      title={label}
      type='button'>
      {t("mods.by")} {mod.author}
    </button>
  );
};
