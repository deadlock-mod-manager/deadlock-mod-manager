import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { LuSearch } from "react-icons/lu";
import type { ModFilters } from "@/hooks/use-mod-filters";

interface ModsEmptyStateProps {
  filters: ModFilters;
}

export function ModsEmptyState({ filters }: ModsEmptyStateProps) {
  const hasActiveFilters =
    filters.search ||
    filters.categories.length > 0 ||
    filters.heroes.length > 0 ||
    filters.audioOnly ||
    filters.showNSFW;

  return (
    <Empty className='py-12'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          <LuSearch className='h-16 w-16' />
        </EmptyMedia>
        <EmptyTitle>No mods found</EmptyTitle>
        <EmptyDescription>
          {hasActiveFilters
            ? "No mods match your current search and filters. Try adjusting your filters."
            : "No mods available at the moment."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
