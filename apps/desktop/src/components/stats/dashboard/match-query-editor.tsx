import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import {
  MATCH_AGGREGATES,
  MATCH_GROUPS,
  MATCH_METRICS,
  MAX_SERIES,
  type MatchQuery,
} from "@/lib/stats/dashboard/layout";
import { cn } from "@/lib/utils";
import { OptionRow } from "./view-options";
import { HeroSelect } from "./hero-select";
import { NullableNumberSelect } from "./nullable-number-select";

const WINDOW_CHOICES = [10, 20, 30, 50, 100, 200] as const;

const DAY_CHOICES = [7, 14, 30, 90, 180, 365] as const;

const SMOOTHING_CHOICES = [5, 10, 20] as const;

export const MatchQueryEditor = ({
  query,
  onChange,
}: {
  query: MatchQuery;
  onChange: (query: MatchQuery) => void;
}) => {
  const { t } = useTranslation();
  const patch = (next: Partial<MatchQuery>) => onChange({ ...query, ...next });

  const toggleMetric = (metric: MatchQuery["metrics"][number]) => {
    if (query.metrics.includes(metric)) {
      if (query.metrics.length > 1) {
        patch({ metrics: query.metrics.filter((entry) => entry !== metric) });
      }
      return;
    }
    patch({ metrics: [...query.metrics, metric].slice(-MAX_SERIES) });
  };

  return (
    <div className='flex flex-col gap-4'>
      <OptionRow
        label={t("stats.dashboard.matchQuery.metrics", { count: MAX_SERIES })}>
        <div className='flex flex-wrap gap-1.5'>
          {MATCH_METRICS.map((metric) => (
            <button
              aria-pressed={query.metrics.includes(metric)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                query.metrics.includes(metric)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              key={metric}
              onClick={() => toggleMetric(metric)}
              type='button'>
              {t(`stats.dashboard.fields.${metric}`)}
            </button>
          ))}
        </div>
      </OptionRow>

      <div className='grid grid-cols-2 gap-3'>
        <OptionRow label={t("stats.dashboard.matchQuery.groupBy")}>
          <Select
            onValueChange={(value) =>
              patch({
                groupBy:
                  MATCH_GROUPS.find((group) => group === value) ?? "none",
              })
            }
            value={query.groupBy}>
            <SelectTrigger
              aria-label={t("stats.dashboard.matchQuery.groupBy")}
              className='h-9'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_GROUPS.map((group) => (
                <SelectItem key={group} value={group}>
                  {t(`stats.dashboard.matchQuery.groups.${group}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>
        <OptionRow label={t("stats.dashboard.matchQuery.aggregate")}>
          <Select
            onValueChange={(value) =>
              patch({
                aggregate:
                  MATCH_AGGREGATES.find((aggregate) => aggregate === value) ??
                  "avg",
              })
            }
            value={query.aggregate}>
            <SelectTrigger className='h-9'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_AGGREGATES.map((aggregate) => (
                <SelectItem key={aggregate} value={aggregate}>
                  {t(`stats.dashboard.matchQuery.aggregates.${aggregate}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>
        <OptionRow label={t("stats.dashboard.matchQuery.period")}>
          <NullableNumberSelect
            choices={DAY_CHOICES}
            label={(count) => t("stats.dashboard.options.lastDays", { count })}
            noneLabel={t("stats.dashboard.options.allTime")}
            onChange={(sinceDays) => patch({ sinceDays })}
            value={query.sinceDays}
          />
        </OptionRow>
        <OptionRow label={t("stats.dashboard.matchQuery.window")}>
          <NullableNumberSelect
            choices={WINDOW_CHOICES}
            label={(count) =>
              t("stats.dashboard.options.lastMatches", { count })
            }
            noneLabel={t("stats.dashboard.options.allMatches")}
            onChange={(lastMatches) => patch({ lastMatches })}
            value={query.lastMatches}
          />
        </OptionRow>
        <OptionRow label={t("stats.dashboard.params.hero")}>
          <HeroSelect
            allowAll
            onChange={(heroId) =>
              patch({ heroId: heroId === 0 ? null : heroId })
            }
            value={query.heroId ?? 0}
          />
        </OptionRow>
        <OptionRow label={t("stats.dashboard.matchQuery.result")}>
          <Select
            onValueChange={(value) =>
              patch({
                result: value === "wins" || value === "losses" ? value : "all",
              })
            }
            value={query.result}>
            <SelectTrigger className='h-9'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["all", "wins", "losses"] as const).map((result) => (
                <SelectItem key={result} value={result}>
                  {t(`stats.dashboard.matchQuery.results.${result}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>
        {query.groupBy === "match" && (
          <OptionRow label={t("stats.dashboard.matchQuery.smoothing")}>
            <NullableNumberSelect
              choices={SMOOTHING_CHOICES}
              label={(count) =>
                t("stats.dashboard.options.rollingWindow", { count })
              }
              noneLabel={t("stats.dashboard.matchQuery.noSmoothing")}
              onChange={(smoothing) => patch({ smoothing })}
              value={query.smoothing}
            />
          </OptionRow>
        )}
        <label className='col-span-2 flex items-center justify-between gap-2 text-sm'>
          {t("stats.dashboard.matchQuery.rankedOnly")}
          <Switch
            checked={query.rankedOnly}
            onCheckedChange={(rankedOnly) => patch({ rankedOnly })}
          />
        </label>
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t("stats.dashboard.matchQuery.hint")}
      </p>
    </div>
  );
};
