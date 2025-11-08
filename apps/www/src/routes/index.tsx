import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FAQSection } from "@/components/faq";
import { FeaturesSection } from "@/components/features";
import { HeroSection } from "@/components/hero";
import { LatestUpdateVideoSection } from "@/components/latest-update-video";
import { ModShowcaseSection } from "@/components/mod-showcase";
import { StatsSection } from "@/components/stats";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  head: () =>
    seo({
      title: "Deadlock Mod Manager | Download, Install & Manage Deadlock Mods",
    }),
});

function HomeComponent() {
  const versionQuery = useQuery(orpc.getVersion.queryOptions());
  const version = versionQuery.data?.version || "0.0.0";

  return (
    <>
      <HeroSection version={version} />
      <LatestUpdateVideoSection videoId='I6qBxyum8QY' />
      <FeaturesSection />
      <StatsSection />
      <ModShowcaseSection />
      <FAQSection />
    </>
  );
}
