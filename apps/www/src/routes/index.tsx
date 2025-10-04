import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FAQSection } from "@/components/faq";
import { FeaturesSection } from "@/components/features";
import { HeroSection } from "@/components/hero";
import { ModShowcaseSection } from "@/components/mod-showcase";
import { StatsSection } from "@/components/stats";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const versionQuery = useQuery(orpc.getVersion.queryOptions());
  const version = versionQuery.data?.version || "0.0.0";

  return (
    <>
      <HeroSection version={version} />
      <FeaturesSection />
      <StatsSection />
      <ModShowcaseSection />
      <FAQSection />
    </>
  );
}
