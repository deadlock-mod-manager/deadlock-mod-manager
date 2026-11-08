import { useTranslation } from "react-i18next";
import { usePerformancePacks } from "@/hooks/performance/use-performance-packs";
import { PerformancePackCard } from "./configs/performance-pack-card";

export const PerformancePacksSection = () => {
  const { t } = useTranslation();
  const { data: packs = [] } = usePerformancePacks();
  if (packs.length === 0) return null;

  return (
    <section className='flex flex-col gap-3'>
      <div>
        <h2 className='font-semibold text-base'>
          {t("performance.configs.packs.title")}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t("performance.configs.packs.description")}
        </p>
      </div>
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {packs.map((listing) => (
          <PerformancePackCard key={listing.remoteId} listing={listing} />
        ))}
      </div>
    </section>
  );
};
