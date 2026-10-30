import { Badge } from "@deadlock-mods/ui/components/badge";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ExternalLink, Search } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  API_EXAMPLES,
  API_PLACEHOLDERS,
} from "@/lib/stats/dashboard/api-query";
import {
  PRESET_CATEGORIES,
  PRESETS,
  type PresetDef,
  type PresetParams,
} from "@/lib/stats/dashboard/catalog";
import {
  MATCH_AGGREGATES,
  MATCH_GROUPS,
  MATCH_METRICS,
  MAX_SERIES,
  type MatchQuery,
} from "@/lib/stats/dashboard/layout";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./dashboard-context";
import { PANEL_IDS, panelDef, useHiddenPanels } from "./panels";
import { OptionRow } from "./view-options";

const API_DOCS_URL = "https://api.deadlock-api.com/docs";
/** Long enough that a half-typed path is never sent to the API. */
const TYPING_SETTLE_MS = 600;
const ALL = "__all";

const useHeroOptions = () => {
  const { heroesById } = useDashboardData();
  return useMemo(
    () => [...heroesById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [heroesById],
  );
};

const HeroSelect = ({
  value,
  allowAll,
  onChange,
}: {
  value: number;
  allowAll: boolean;
  onChange: (heroId: number) => void;
}) => {
  const { t } = useTranslation();
  const heroes = useHeroOptions();
  return (
    <Select
      onValueChange={(next) => onChange(next === ALL ? 0 : Number(next))}
      value={value === 0 ? ALL : String(value)}>
      <SelectTrigger className='h-9'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='max-h-72'>
        {allowAll && (
          <SelectItem value={ALL}>
            {t("stats.dashboard.options.allHeroes")}
          </SelectItem>
        )}
        {heroes.map((hero) => (
          <SelectItem key={hero.id} value={String(hero.id)}>
            {hero.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

interface PresetPickerProps {
  selectedId: string | null;
  onSelect: (preset: PresetDef) => void;
}

export const PresetPicker = ({ selectedId, onSelect }: PresetPickerProps) => {
  const { t } = useTranslation();
  const { accountId } = useDashboardData();
  const [search, setSearch] = useState("");

  const text = (preset: PresetDef) =>
    `${t(`stats.dashboard.presets.${preset.id}.title`)} ${t(`stats.dashboard.presets.${preset.id}.description`)}`.toLowerCase();

  const query = search.trim().toLowerCase();
  const visible = PRESETS.filter(
    (preset) => query === "" || text(preset).includes(query),
  );

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative'>
        <Search className='absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground' />
        <Input
          className='h-9 pl-8'
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("stats.dashboard.editor.searchPresets")}
          value={search}
        />
      </div>
      {PRESET_CATEGORIES.map((category) => {
        const presets = visible.filter(
          (preset) => preset.category === category,
        );
        if (presets.length === 0) {
          return null;
        }
        return (
          <section className='flex flex-col gap-1.5' key={category}>
            <h4 className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
              {t(`stats.dashboard.categories.${category}`)}
            </h4>
            {presets.map((preset) => (
              <button
                aria-pressed={selectedId === preset.id}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                  selectedId === preset.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-accent",
                )}
                data-preset-id={preset.id}
                key={preset.id}
                onClick={() => onSelect(preset)}
                type='button'>
                <span className='flex items-center gap-2 font-medium text-sm'>
                  {t(`stats.dashboard.presets.${preset.id}.title`)}
                  {preset.needsAccount && accountId === null && (
                    <Badge className='h-4 px-1 text-[10px]' variant='outline'>
                      {t("stats.dashboard.needsAccount")}
                    </Badge>
                  )}
                </span>
                <span className='text-muted-foreground text-xs leading-snug'>
                  {t(`stats.dashboard.presets.${preset.id}.description`)}
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {visible.length === 0 && (
        <p className='py-6 text-center text-muted-foreground text-sm'>
          {t("stats.dashboard.editor.noPresets")}
        </p>
      )}
    </div>
  );
};

export const PresetParamsEditor = ({
  preset,
  params,
  onChange,
}: {
  preset: PresetDef;
  params: PresetParams;
  onChange: (params: PresetParams) => void;
}) => {
  const { t } = useTranslation();
  if (preset.params.length === 0) {
    return null;
  }
  return (
    <div className='grid grid-cols-2 gap-3'>
      {preset.params.map((param) => {
        const value = params[param.key] ?? param.default;
        return (
          <OptionRow
            key={param.key}
            label={t(`stats.dashboard.params.${param.key}`)}>
            {param.kind === "hero" ? (
              <HeroSelect
                allowAll={param.default === 0}
                onChange={(heroId) =>
                  onChange({ ...params, [param.key]: heroId })
                }
                value={Number(value)}
              />
            ) : (
              <Select
                onValueChange={(next) => {
                  const option = param.options?.find(
                    (entry) => String(entry.value) === next,
                  );
                  if (option) {
                    onChange({ ...params, [param.key]: option.value });
                  }
                }}
                value={String(value)}>
                <SelectTrigger className='h-9'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {param.options?.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {t(`stats.dashboard.options.${option.label}`, {
                        count: option.count,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </OptionRow>
        );
      })}
    </div>
  );
};

const WINDOW_CHOICES = [10, 20, 30, 50, 100, 200] as const;
const DAY_CHOICES = [7, 14, 30, 90, 180, 365] as const;
const SMOOTHING_CHOICES = [5, 10, 20] as const;

const NullableNumberSelect = ({
  value,
  choices,
  noneLabel,
  label,
  onChange,
}: {
  value: number | null;
  choices: readonly number[];
  noneLabel: string;
  label: (count: number) => string;
  onChange: (value: number | null) => void;
}) => (
  <Select
    onValueChange={(next) => onChange(next === ALL ? null : Number(next))}
    value={value === null ? ALL : String(value)}>
    <SelectTrigger className='h-9'>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>{noneLabel}</SelectItem>
      {choices.map((choice) => (
        <SelectItem key={choice} value={String(choice)}>
          {label(choice)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

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

export const ApiQueryEditor = ({
  path,
  listPath,
  onChange,
}: {
  path: string;
  listPath: string;
  onChange: (next: { path: string; listPath: string }) => void;
}) => {
  const { t } = useTranslation();
  // Every committed path is a request, so typing edits a local copy and only
  // a pause, Enter or a picked example hands it to the widget.
  const [draft, setDraft] = useState({ path, listPath });
  const timer = useRef<number | undefined>(undefined);
  const latestOnChange = useRef(onChange);
  useEffect(() => {
    latestOnChange.current = onChange;
  }, [onChange]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (next: { path: string; listPath: string }, delay: number) => {
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => latestOnChange.current(next),
      delay,
    );
  };

  return (
    <div className='flex flex-col gap-4'>
      <OptionRow label={t("stats.dashboard.api.example")}>
        <Select
          onValueChange={(id) => {
            const example = API_EXAMPLES.find((entry) => entry.id === id);
            if (example) {
              commit({ path: example.path, listPath: example.listPath }, 0);
            }
          }}>
          <SelectTrigger className='h-9'>
            <SelectValue
              placeholder={t("stats.dashboard.api.examplePlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {API_EXAMPLES.map((example) => (
              <SelectItem key={example.id} value={example.id}>
                {t(`stats.dashboard.api.examples.${example.id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </OptionRow>
      <OptionRow label={t("stats.dashboard.api.path")}>
        <Input
          aria-label={t("stats.dashboard.api.path")}
          className='h-9 font-mono text-xs'
          onChange={(event) =>
            commit({ ...draft, path: event.target.value }, TYPING_SETTLE_MS)
          }
          onKeyDown={(event) => event.key === "Enter" && commit(draft, 0)}
          onBlur={() => commit(draft, 0)}
          placeholder='/v1/analytics/hero-stats'
          spellCheck={false}
          value={draft.path}
        />
        <div className='flex flex-wrap gap-1'>
          {API_PLACEHOLDERS.map((placeholder) => (
            <button
              className='rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent'
              key={placeholder}
              onClick={() =>
                commit({ ...draft, path: `${draft.path}{${placeholder}}` }, 0)
              }
              title={t(`stats.dashboard.api.placeholders.${placeholder}`)}
              type='button'>
              {`{${placeholder}}`}
            </button>
          ))}
        </div>
      </OptionRow>
      <OptionRow label={t("stats.dashboard.api.listPath")}>
        <Input
          className='h-9 font-mono text-xs'
          onChange={(event) =>
            commit({ ...draft, listPath: event.target.value }, TYPING_SETTLE_MS)
          }
          onKeyDown={(event) => event.key === "Enter" && commit(draft, 0)}
          onBlur={() => commit(draft, 0)}
          placeholder={t("stats.dashboard.api.listPathPlaceholder")}
          spellCheck={false}
          value={draft.listPath}
        />
      </OptionRow>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t("stats.dashboard.api.hint")}{" "}
        <button
          className='inline-flex items-center gap-1 text-primary hover:underline'
          onClick={() => void openUrl(API_DOCS_URL)}
          type='button'>
          {t("stats.dashboard.api.docs")}
          <ExternalLink className='h-3 w-3' />
        </button>
      </p>
    </div>
  );
};

export const PanelPicker = ({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (panel: string) => void;
}) => {
  const { t } = useTranslation();
  const hiddenPanels = useHiddenPanels();
  return (
    <div className='flex flex-col gap-1.5'>
      {PANEL_IDS.filter((id) => !hiddenPanels.has(id)).map((id) => {
        const Icon = panelDef(id)?.icon;
        return (
          <button
            aria-pressed={selected === id}
            className={cn(
              "flex items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
              selected === id
                ? "border-primary bg-primary/10"
                : "hover:bg-accent",
            )}
            key={id}
            onClick={() => onSelect(id)}
            type='button'>
            {Icon && (
              <Icon className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
            )}
            <span className='flex flex-col gap-0.5'>
              <span className='font-medium text-sm'>
                {t(`stats.dashboard.panels.${id}.title`)}
              </span>
              <span className='text-muted-foreground text-xs leading-snug'>
                {t(`stats.dashboard.panels.${id}.description`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
