import type { ModDto } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ModsEmptyState } from "@/components/mods/mods-empty-state";
import { ModsFilters } from "@/components/mods/mods-filters";
import { ModsGrid } from "@/components/mods/mods-grid";
import { ModsLoadingSkeleton } from "@/components/mods/mods-loading-skeleton";
import { ModsPageHeader } from "@/components/mods/mods-page-header";
import { useModFilters } from "@/hooks/use-mod-filters";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/mods/")({
  component: ModsPage,
  head: () => ({
    meta: [
      {
        title: "Browse Deadlock Mods - Deadlock Mod Manager",
      },
      {
        name: "description",
        content:
          "Browse and discover mods for Valve's Deadlock game. Updated hourly with new skins, gameplay modifications, HUD mods, and more from GameBanana.",
      },
      {
        name: "keywords",
        content:
          "deadlock mods, deadlock skins, deadlock gameplay mods, valve deadlock mods, gamebanana deadlock, deadlock modding community",
      },
      {
        property: "og:title",
        content: "Browse Deadlock Mods - Deadlock Mod Manager",
      },
      {
        property: "og:description",
        content:
          "Browse and discover mods for Valve's Deadlock game. Updated hourly with new skins, gameplay modifications, HUD mods, and more.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://deadlockmods.app/mods",
      },
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://deadlockmods.app/mods",
      },
    ],
  }),
});

function ModsPage() {
  const { data: mods = [], isLoading } = useQuery(
    orpc.listModsV2.queryOptions(),
  );

  const filterState = useModFilters(mods as never[]);
  const { filters, filteredAndSortedMods } = filterState;

  if (isLoading) {
    return <ModsLoadingSkeleton />;
  }

  return (
    <div className='container mx-auto px-4 py-12 pb-16'>
      <ModsPageHeader
        title='Browse Mods'
        description='Discover and download mods for Deadlock. Updated hourly with new mods added every hour.'
      />

      <div className='mb-10'>
        <ModsFilters filterState={filterState} />
      </div>

      {filteredAndSortedMods.length === 0 && (
        <ModsEmptyState filters={filters} />
      )}

      {filteredAndSortedMods.length > 0 && (
        <ModsGrid mods={filteredAndSortedMods as ModDto[]} />
      )}
    </div>
  );
}
