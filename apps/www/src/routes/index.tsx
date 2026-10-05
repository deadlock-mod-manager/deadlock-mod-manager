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
    await Promise.all([
      prefetchWithin(queryClient, orpc.getStats.queryOptions()),
      prefetchWithin(queryClient, orpc.getVersion.queryOptions()),
    ]);
  },
  head: () => {
    const page = seo({
      title: "Deadlock Mod Manager | Install & Manage Deadlock Mods",
      path: "/",
    });
    return {
      ...page,
      scripts: [
        { type: "application/ld+json", children: homeStructuredData() },
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
