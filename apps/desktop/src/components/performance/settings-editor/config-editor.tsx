import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useApplyPerfConfig } from "@/hooks/performance/use-perf-mutations";
import { usePerfResolve } from "@/hooks/performance/use-perf-queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getErrorMessage } from "@/lib/errors";
import { applySourceFor } from "@/lib/performance/config-list";
import {
  type EditorConfigOption,
  isAppliedAs,
  savedDraftFor,
  withDraft,
} from "@/lib/performance/editor/configs";
import {
  applyDraftAction,
  countUnsavedChanges,
  type DraftAction,
  overridesByKey,
} from "@/lib/performance/editor/draft";
import {
  type EditorFilter,
  filterCounts,
  groupEntries,
  isEngineSectionEntry,
} from "@/lib/performance/editor/filter";
import { initialValueFor } from "@/lib/performance/editor/values";
import { pathKey } from "@/lib/performance/request";
import { usePersistedStore } from "@/lib/store";
import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import { AddSettingPopover } from "./add-setting-popover";
import { ApplyBar } from "./apply-bar";
import { CategoryRail } from "./category-rail";
import { EditorHeader } from "./editor-header";
import { EditorToolbar } from "./editor-toolbar";
import { useEditorDrafts } from "./editor-drafts-context";
import { EngineSectionsNotice } from "./engine-sections-notice";
import { EntryGroup } from "./entry-group";
import { entryDomId } from "./entry-row";

const RESOLVE_DEBOUNCE_MS = 250;
const HIGHLIGHT_MS = 1600;

type ConfigEditorProps = {
  /** The config's request without tweaks. */
  base: PerfApplyRequest;
  options: EditorConfigOption[];
  categories: CategoryInfo[];
  desired: PerfApplyRequest | null;
  gameinfoFound: boolean;
  onSelectConfig: (configId: string) => void;
};

const EditorSkeleton = () => (
  <div className='grid grid-cols-[12.5rem_minmax(0,1fr)] gap-5'>
    <div className='space-y-2'>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton className='h-7 w-full' key={index} />
      ))}
    </div>
    <div className='space-y-2'>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className='h-16 w-full' key={index} />
      ))}
    </div>
  </div>
);

export const ConfigEditor = ({
  base,
  options,
  categories,
  desired,
  gameinfoFound,
  onSelectConfig,
}: ConfigEditorProps) => {
  const { t } = useTranslation();
  const configId = base.configId;

  const savedOverrides = usePersistedStore((state) => state.perfOverrides);
  const savedInclude = usePersistedStore(
    (state) => state.perfIncludeEngineSections,
  );
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const setPerfOverrides = usePersistedStore((state) => state.setPerfOverrides);
  const setPerfIncludeEngineSections = usePersistedStore(
    (state) => state.setPerfIncludeEngineSections,
  );
  const apply = useApplyPerfConfig();

  const { drafts, updateDraft } = useEditorDrafts();
  const saved = useMemo(
    () => savedDraftFor(configId, savedOverrides, savedInclude, desired),
    [configId, savedOverrides, savedInclude, desired],
  );
  const draft = drafts[configId] ?? saved;
  const unsavedCount = countUnsavedChanges(saved, draft);
  const appliedAsSaved = isAppliedAs(configId, saved, desired);

  const dispatch = useCallback(
    (action: DraftAction) =>
      updateDraft(configId, (current) => {
        const next = applyDraftAction(current ?? saved, action);
        return countUnsavedChanges(saved, next) === 0 ? null : next;
      }),
    [configId, saved, updateDraft],
  );

  const request = useMemo(() => withDraft(base, draft), [base, draft]);
  const debouncedRequest = useDebouncedValue(request, RESOLVE_DEBOUNCE_MS);
  const resolve = usePerfResolve(debouncedRequest);
  const entries = resolve.data?.entries;

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<EditorFilter>("differs");
  const [showKeys, setShowKeys] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const overrides = useMemo(
    () => overridesByKey(draft.overrides),
    [draft.overrides],
  );
  const changedKeys = useMemo(() => new Set(overrides.keys()), [overrides]);
  const groups = useMemo(
    () =>
      groupEntries(entries ?? [], categories, {
        search: deferredSearch,
        filter,
        changedKeys,
      }),
    [entries, categories, deferredSearch, filter, changedKeys],
  );
  const visibleGroups = groups.filter((group) => group.entries.length > 0);
  const counts = filterCounts(groups);
  const configKeys = useMemo(
    () => new Set((entries ?? []).map((entry) => pathKey(entry.path))),
    [entries],
  );
  const engineEntries = useMemo(
    () => (entries ?? []).filter(isEngineSectionEntry),
    [entries],
  );
  const engineSections = useMemo(
    () => [...new Set(engineEntries.map((entry) => entry.path[0]))],
    [engineEntries],
  );

  const groupElements = useRef(new Map<string, HTMLElement>());
  const registerGroup = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) groupElements.current.set(id, element);
      else groupElements.current.delete(id);
    },
    [],
  );
  const visibleGroupIds = visibleGroups.map((group) => group.id).join("|");

  useEffect(() => {
    if (visibleGroupIds === "") return;
    const observer = new IntersectionObserver(
      (records) => {
        const entering = records.find((record) => record.isIntersecting);
        const id = entering?.target.getAttribute("data-category");
        if (id) setActiveCategory(id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    for (const element of groupElements.current.values()) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [visibleGroupIds]);

  useEffect(() => {
    if (!pendingScrollKey) return;
    const element = document.getElementById(entryDomId(pendingScrollKey));
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightKey(pendingScrollKey);
    setPendingScrollKey(null);
  }, [pendingScrollKey, groups]);

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightKey]);

  const toggleExpanded = useCallback(
    (id: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    groupElements.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openAddSetting = (query: string) => {
    setAddQuery(query);
    setAddOpen(true);
  };

  const pickConvar = (meta: ConvarMeta) => {
    const path = ["ConVars", meta.name];
    const key = pathKey(path);
    const existing = entries?.find((entry) => pathKey(entry.path) === key);
    if (!existing) {
      dispatch({ kind: "set", path, value: initialValueFor(meta) });
    }
    setSearch("");
    setFilter("all");
    setExpanded((current) =>
      new Set(current).add(existing?.category ?? meta.category),
    );
    setPendingScrollKey(key);
    setAddOpen(false);
  };

  const discard = () => updateDraft(configId, () => null);

  const applyDraft = () => {
    setPerfOverrides(configId, draft.overrides);
    setPerfIncludeEngineSections(configId, draft.includeEngineSections);
    updateDraft(configId, () => null);
    apply.mutate({
      request,
      source: applySourceFor(configId, userConfigs),
      entryPoint: "editor",
    });
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  const renderList = () => {
    if (!resolve.data && resolve.isError) {
      return (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t("performance.editor.loadError.title")}</EmptyTitle>
            <EmptyDescription>
              {getErrorMessage(resolve.error)}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => resolve.refetch()}
              size='sm'
              variant='outline'>
              {t("performance.editor.loadError.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
    if (!resolve.data) return <EditorSkeleton />;

    if (resolve.data.entries.length === 0) {
      return (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t("performance.editor.noEntries.title")}</EmptyTitle>
            <EmptyDescription>
              {t("performance.editor.noEntries.description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => openAddSetting("")}
              size='sm'
              variant='outline'>
              {t("performance.editor.toolbar.addSetting")}
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <div className='grid grid-cols-[12.5rem_minmax(0,1fr)] gap-5'>
        <CategoryRail
          activeId={activeCategory}
          groups={groups}
          onSelect={scrollToCategory}
        />
        <div className='min-w-0 space-y-4'>
          {engineEntries.length > 0 && (
            <EngineSectionsNotice
              count={engineEntries.length}
              included={draft.includeEngineSections}
              onIncludedChange={(include) =>
                dispatch({ kind: "includeEngineSections", include })
              }
              sections={engineSections}
            />
          )}
          {visibleGroups.length === 0 ? (
            <Empty className='border'>
              <EmptyHeader>
                <EmptyTitle>
                  {t("performance.editor.noMatches.title")}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent className='flex-row justify-center'>
                <Button onClick={clearFilters} size='sm' variant='outline'>
                  {t("performance.editor.noMatches.clear")}
                </Button>
                {search.trim() !== "" && (
                  <Button
                    onClick={() => openAddSetting(search.trim())}
                    size='sm'
                    variant='ghost'>
                    {t("performance.editor.noMatches.searchAll", {
                      query: search.trim(),
                    })}
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            visibleGroups.map((group) => (
              <EntryGroup
                engineIncluded={draft.includeEngineSections}
                expanded={expanded.has(group.id)}
                group={group}
                highlightKey={highlightKey}
                key={group.id}
                onAction={dispatch}
                onToggleExpanded={toggleExpanded}
                overrides={overrides}
                registerElement={registerGroup}
                showKeys={showKeys}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-4'>
      <EditorHeader
        appliedConfigId={desired?.configId ?? null}
        isUpdating={
          resolve.data !== undefined &&
          (resolve.isFetching || request !== debouncedRequest)
        }
        onChange={onSelectConfig}
        options={options}
        resolved={resolve.data}
        value={configId}
      />
      <EditorToolbar
        addSetting={
          <AddSettingPopover
            configKeys={configKeys}
            initialQuery={addQuery}
            onOpenChange={(open) => {
              if (!open) setAddQuery("");
              setAddOpen(open);
            }}
            onPick={pickConvar}
            open={addOpen}
          />
        }
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onShowKeysChange={setShowKeys}
        search={search}
        showKeys={showKeys}
      />
      {renderList()}
      {(unsavedCount > 0 || !appliedAsSaved || apply.isPending) && (
        <ApplyBar
          canApply={gameinfoFound}
          configName={base.name}
          isApplying={apply.isPending}
          onApply={applyDraft}
          onDiscard={discard}
          unsavedCount={unsavedCount}
        />
      )}
    </div>
  );
};
