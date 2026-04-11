import { createFileRoute } from "@tanstack/react-router";
import { ModPackager } from "@/components/mod-packager";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/mod-packager")({
  component: ModPackagerPage,
  head: () =>
    seo({
      title: "Mod Packager | Deadlock Mod Manager",
      description:
        "Create dmm.json metadata files for your Deadlock mods with a guided wizard",
    }),
});

function ModPackagerPage() {
  return (
    <div className='container mx-auto py-8'>
      <div className='mx-auto max-w-4xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 font-bold font-primary text-3xl'>Mod Packager</h1>
          <p className='text-lg text-muted-foreground'>
            Create metadata files for your Deadlock mods with a step-by-step
            wizard
          </p>
        </div>
        <ModPackager />
      </div>
    </div>
  );
}
