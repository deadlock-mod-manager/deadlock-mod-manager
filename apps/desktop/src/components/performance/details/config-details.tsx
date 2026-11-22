import { SheetTitle } from "@deadlock-mods/ui/components/sheet";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { useTranslation } from "react-i18next";
import { usePerfConfigList } from "@/hooks/performance/use-perf-config-list";
import { ApplicableDetails } from "./applicable-details";
import { CommunityDetails } from "./community-details";

/** The sheet's body: a preset or user config, a GameBanana config, or "not found". */
export const ConfigDetails = ({ configId }: { configId: string }) => {
  const { t } = useTranslation();
  const { catalogQuery, items } = usePerfConfigList();
  const item = items.find((candidate) => candidate.configId === configId);

  if (!item) {
    return (
      <div className='flex flex-col gap-3 p-6'>
        <SheetTitle>{t("performance.details.title")}</SheetTitle>
        {catalogQuery.isPending ? (
          <Skeleton className='h-40 w-full' />
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t("performance.details.notFound")}
          </p>
        )}
      </div>
    );
  }

  if (item.kind === "community") {
    return (
      <CommunityDetails
        item={item}
        latestBuild={catalogQuery.data?.latestBuild ?? null}
      />
    );
  }

  return (
    <ApplicableDetails
      config={
        item.kind === "preset"
          ? { kind: "preset", preset: item.preset }
          : { kind: "user", config: item.config }
      }
      item={item}
    />
  );
};
