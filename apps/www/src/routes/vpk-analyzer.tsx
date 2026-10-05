import { createFileRoute } from "@tanstack/react-router";
import { VpkAnalyzer } from "@/components/vpk-analyzer";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/vpk-analyzer")({
  component: VpkAnalyzerComponent,
  head: () =>
    seo({
      title: "Deadlock VPK Analyzer: Find Which Mod a VPK File Is From",
      description:
        "Upload a Deadlock .vpk file and the VPK Analyzer matches it against known GameBanana mods, so you can tell which mod a stray pak file belongs to.",
      path: "/vpk-analyzer",
    }),
});

function VpkAnalyzerComponent() {
  return (
    <div className='container mx-auto py-8'>
      <div className='mx-auto max-w-4xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 font-bold font-primary text-3xl'>VPK Analyzer</h1>
          <p className='text-lg text-muted-foreground'>
            Upload a VPK file to analyze which mod it belongs to
          </p>
        </div>
        <VpkAnalyzer />
      </div>
    </div>
  );
}
