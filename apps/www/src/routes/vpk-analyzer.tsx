import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { VpkAnalyzer } from "@/components/vpk-analyzer";
import { headI18n } from "@/lib/i18n/route";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/vpk-analyzer")({
  component: VpkAnalyzerComponent,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "tool-vpk");
    return seo({
      title: t("meta.title"),
      description: t("meta.description"),
      path: "/vpk-analyzer",
      locale,
    });
  },
});

function VpkAnalyzerComponent() {
  const { t } = useTranslation("tool-vpk");

  return (
    <div className='container mx-auto py-8'>
      <div className='mx-auto max-w-4xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 font-bold font-primary text-3xl'>
            {t("page.title")}
          </h1>
          <p className='text-lg text-muted-foreground'>
            {t("page.description")}
          </p>
        </div>
        <VpkAnalyzer />
      </div>
    </div>
  );
}
