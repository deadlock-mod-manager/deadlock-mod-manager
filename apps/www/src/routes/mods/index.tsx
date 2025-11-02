import type { ModDto } from "@deadlock-mods/shared";
import { createFileRoute } from "@tanstack/react-router";
import { ModsEmptyState } from "@/components/mods/mods-empty-state";
import { ModsFilters } from "@/components/mods/mods-filters";
import { ModsGrid } from "@/components/mods/mods-grid";
import { ModsPageHeader } from "@/components/mods/mods-page-header";
import { useModFilters } from "@/hooks/use-mod-filters";
import { serverClient } from "@/utils/orpc.server";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/mods/")({
  component: ModsPage,
  loader: async () => {
    const mods = await serverClient.listModsV2();
    return mods;
  },
  head: () => {
    const seoTags = seo({
      title: "Browse Deadlock Mods - Deadlock Mod Manager",
      description:
        "Browse and discover mods for Valve's Deadlock game. Updated hourly with new skins, gameplay modifications, HUD mods, and more from GameBanana.",
      keywords:
        "deadlock mods, deadlock skins, deadlock gameplay mods, valve deadlock mods, gamebanana deadlock, deadlock modding community",
      image: "https://deadlockmods.app/og-image.png",
      url: "https://deadlockmods.app/mods",
      canonical: "https://deadlockmods.app/mods",
      type: "website",
    });

    return seoTags;
  },
});

function ModsPage() {
  const mods = Route.useLoaderData();

  const filterState = useModFilters(mods as never[]);
  const { filters, filteredAndSortedMods } = filterState;

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
