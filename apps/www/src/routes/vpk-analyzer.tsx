import { createFileRoute } from "@tanstack/react-router";
import { VpkAnalyzer } from "@/components/vpk-analyzer";

export const Route = createFileRoute("/vpk-analyzer")({
  component: VpkAnalyzerComponent,
});

function VpkAnalyzerComponent() {
  return (
    <div className='container mx-auto py-8'>
      <div className='mx-auto max-w-4xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 font-bold text-3xl'>VPK Analyzer</h1>
          <p className='text-lg text-muted-foreground'>
            Upload a VPK file to analyze which mod it belongs to
          </p>
        </div>
        <VpkAnalyzer />
      </div>
    </div>
  );
}
