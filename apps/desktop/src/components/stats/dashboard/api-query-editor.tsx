import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  API_EXAMPLES,
  API_PLACEHOLDERS,
} from "@/lib/stats/dashboard/api-query";
import { OptionRow } from "./view-options";

const API_DOCS_URL = "https://api.deadlock-api.com/docs";

/** Long enough that a half-typed path is never sent to the API. */
const TYPING_SETTLE_MS = 600;

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
