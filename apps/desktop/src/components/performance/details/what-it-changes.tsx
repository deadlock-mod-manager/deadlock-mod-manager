import { useTranslation } from "react-i18next";
import { compareCategories } from "@/lib/performance/resolved-summary";
import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";
import { DetailsSection } from "./details-parts";

type WhatItChangesProps = {
  categories: CategoryInfo[];
  resolved: ResolvedConfig;
  /** The active config, when it is a different one. */
  current: ResolvedConfig | null;
  isCurrent: boolean;
};

export const WhatItChanges = ({
  categories,
  resolved,
  current,
  isCurrent,
}: WhatItChangesProps) => {
  const { t } = useTranslation();
  const rows = compareCategories(
    categories,
    resolved.entries,
    current?.entries ?? null,
  );
  const max = Math.max(
    1,
    ...rows.map((row) => Math.max(row.config, row.current ?? 0)),
  );

  return (
    <DetailsSection
      description={
        current
          ? t("performance.details.changes.descriptionCompared", {
              count: resolved.counts.applies,
            })
          : t(
              isCurrent
                ? "performance.details.changes.descriptionCurrent"
                : "performance.details.changes.description",
              { count: resolved.counts.applies },
            )
      }
      title={t("performance.details.changes.title")}>
      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t("performance.details.changes.nothing")}
        </p>
      ) : (
        <ul className='flex flex-col gap-1.5'>
          {rows.map((row) => (
            <li className='flex items-center gap-3 text-xs' key={row.id}>
              <span className='w-36 shrink-0 truncate'>
                {t(`performance.categories.${row.id}`, {
                  defaultValue: row.label,
                })}
              </span>
              <span className='relative h-1.5 flex-1 rounded-full bg-muted'>
                <span
                  className='absolute inset-y-0 left-0 rounded-full bg-primary'
                  style={{ width: `${(row.config / max) * 100}%` }}
                />
                {row.current !== null && (
                  <span
                    className='absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground'
                    style={{ left: `${(row.current / max) * 100}%` }}
                    title={t("performance.details.changes.currentValue", {
                      count: row.current,
                    })}
                  />
                )}
              </span>
              <span className='w-8 shrink-0 text-right tabular-nums'>
                {row.config}
                {row.current !== null && (
                  <span className='sr-only'>
                    {t("performance.details.changes.currentValue", {
                      count: row.current,
                    })}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {current && rows.length > 0 && (
        <div className='flex items-center gap-4 text-muted-foreground text-xs'>
          <span className='flex items-center gap-1.5'>
            <span className='h-1.5 w-3 rounded-full bg-primary' />
            {t("performance.details.changes.legendThis")}
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='h-3 w-0.5 rounded-full bg-foreground' />
            {t("performance.details.changes.legendCurrent")}
          </span>
        </div>
      )}
    </DetailsSection>
  );
};
