import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FAQSection } from "@/components/faq";
import { FeaturesSection } from "@/components/features";
import { GettingStartedSection } from "@/components/getting-started";
import { HeroSection } from "@/components/hero";
import { ModShowcaseSection } from "@/components/mod-showcase";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const versionQuery = useQuery(orpc.getVersion.queryOptions());
  const version = versionQuery.data?.version || "0.0.0";
  
  usePageTracking("home", { version });

  return (
    <>
      <HeroSection version={version} />
      <FeaturesSection />
      <ModShowcaseSection />
      <GettingStartedSection />
      <FAQSection />
    </>
  );
}
