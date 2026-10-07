import { createFileRoute } from "@tanstack/react-router";
import {
  StatsSection,
  TrustSection,
  WebToolsSection,
} from "@/components/home/community-sections";
import { SkinsSection } from "@/components/home/customization-sections";
import { FAQSection } from "@/components/home/faq-section";
import { FeatureTour } from "@/components/home/feature-tour";
import { HeroSection } from "@/components/home/hero";
import { PartnersStrip } from "@/components/home/partners-strip";
import { ThemesSection } from "@/components/home/themes-stage";
import { prefetchWithin } from "@/lib/prefetch";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";
import { homeStructuredData } from "@/utils/structured-data";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  // Server-render the stats instead of placeholders that fill in after load.
  loader: async ({ context: { queryClient } }) => {
    const versionQuery = orpc.getVersion.queryOptions();
    await Promise.all([
      prefetchWithin(queryClient, orpc.getStats.queryOptions()),
      prefetchWithin(queryClient, versionQuery),
    ]);
    const version = queryClient.getQueryData(versionQuery.queryKey)?.version;
    // Handed to head() so the release number lands in the indexed metadata.
    return { version: version && version !== "unknown" ? version : undefined };
  },
  head: ({ loaderData }) => {
    const version = loaderData?.version;
    const page = seo({
      title: "Deadlock Mod Manager | Install & Manage Deadlock Mods",
      description: version
        ? `Free, open-source mod manager for Valve's Deadlock on Windows and Linux. Install GameBanana mods, skins and sounds in one click. Latest: v${version}, with V2 coming soon.`
        : undefined,
      path: "/",
    });
    return {
      ...page,
      scripts: [
        {
          type: "application/ld+json",
          children: homeStructuredData({ version }),
        },
      ],
    };
  },
});

function HomeComponent() {
  return (
    <div className='overflow-x-clip'>
      <HeroSection />
      <PartnersStrip />
      <FeatureTour />
      <TrustSection />
      <ThemesSection />
      <SkinsSection />
      <StatsSection />
      <WebToolsSection />
      <FAQSection />
    </div>
  );
}
