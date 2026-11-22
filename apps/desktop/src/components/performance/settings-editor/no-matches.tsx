import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { FunnelSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { EditorFilter } from "@/lib/performance/editor/filter";

/** Why the list is empty for this search or filter, and the way back to a full list. */
export const NoMatches = ({
  search,
  filter,
  onShowAll,
  onSearchAll,
}: {
  search: string;
  filter: EditorFilter;
  onShowAll: () => void;
  onSearchAll: (query: string) => void;
}) => {
  const { t } = useTranslation();
  const query = search.trim();

  return (
    <Empty className='border py-10'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          {query ? <MagnifyingGlassIcon /> : <FunnelSimpleIcon />}
        </EmptyMedia>
        <EmptyTitle>{t("performance.editor.noMatches.title")}</EmptyTitle>
        <EmptyDescription>
          {query
            ? t("performance.editor.noMatches.search", { query })
            : t(`performance.editor.noMatches.${filter}`)}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='flex-row justify-center'>
        <Button onClick={onShowAll} size='sm' variant='outline'>
          {query
            ? t("performance.editor.noMatches.clearSearch")
            : t("performance.editor.noMatches.showAll")}
        </Button>
        {query && (
          <Button onClick={() => onSearchAll(query)} size='sm' variant='ghost'>
            {t("performance.editor.noMatches.searchAll", { query })}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
};
