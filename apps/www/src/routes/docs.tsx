import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { DOCS_URL } from "@/lib/constants";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/docs")({
  component: DocsComponent,
  head: () =>
    seo({
      title: "Documentation | Deadlock Mod Manager",
      description:
        "Access the full documentation for Deadlock Mod Manager including installation guides, usage instructions, troubleshooting tips, and developer resources.",
    }),
});

function DocsComponent() {
  useEffect(() => {
    window.location.href = DOCS_URL;
  }, []);

  return (
    <div className='container mx-auto max-w-3xl py-12 text-center'>
      <h1 className='mb-4 font-bold font-primary text-2xl'>
        Redirecting to Documentation...
      </h1>
      <p className='text-muted-foreground'>
        If you're not redirected automatically,{" "}
        <a className='text-primary hover:underline' href={DOCS_URL}>
          click here
        </a>
        .
      </p>
    </div>
  );
}
