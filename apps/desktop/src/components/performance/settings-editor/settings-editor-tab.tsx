import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  usePerfCatalog,
  usePerfStatus,
} from "@/hooks/performance/use-perf-queries";
import {
  editorBaseRequest,
  editorConfigOptions,
} from "@/lib/performance/editor/configs";
import { usePersistedStore } from "@/lib/store";
import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import { usePerformanceUi } from "../performance-context";
import { ConfigEditor } from "./config-editor";
import { ConfigPicker } from "./editor-header";

const NO_PRESETS: PresetSummary[] = [];
const NO_CATEGORIES: CategoryInfo[] = [];

/**
 * Typed editor for one config's settings. Opens on the applied config unless
 * the user picked another one; Apply saves the tweaks and applies that config.
 */
export const SettingsEditorTab = () => {
  const { t } = useTranslation();
  const { editorConfigId, openEditor, setTab } = usePerformanceUi();
  const status = usePerfStatus();
  const catalog = usePerfCatalog();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);

  const desired = status.data?.desired?.request ?? null;
  const presets = catalog.data?.presets ?? NO_PRESETS;
  const configId = editorConfigId ?? desired?.configId ?? null;

  const options = useMemo(
    () => editorConfigOptions(presets, userConfigs, desired),
    [presets, userConfigs, desired],
  );
  const base = useMemo(
    () =>
      configId === null
        ? null
        : editorBaseRequest(configId, presets, userConfigs, desired),
    [configId, presets, userConfigs, desired],
  );

  if (status.isLoading || catalog.isLoading) {
    return (
      <div className='space-y-3 pt-2'>
        <Skeleton className='h-8 w-96' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!base) {
    return (
      <Empty className='mt-2 border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <SlidersHorizontalIcon />
          </EmptyMedia>
          <EmptyTitle>{t("performance.editor.empty.title")}</EmptyTitle>
          <EmptyDescription>
            {options.length > 0
              ? t("performance.editor.empty.description")
              : t("performance.editor.empty.noConfigs")}
          </EmptyDescription>
          {status.isError && (
            <EmptyDescription>
              {t("performance.editor.empty.statusError")}
            </EmptyDescription>
          )}
        </EmptyHeader>
        <EmptyContent>
          {options.length > 0 && (
            <ConfigPicker
              appliedConfigId={desired?.configId ?? null}
              onChange={openEditor}
              options={options}
              value={null}
            />
          )}
          <Button onClick={() => setTab("configs")} size='sm' variant='outline'>
            {t("performance.editor.empty.browse")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <ConfigEditor
      base={base}
      categories={catalog.data?.categories ?? NO_CATEGORIES}
      desired={desired}
      gameinfoFound={status.data?.gameinfoFound ?? true}
      key={base.configId}
      onSelectConfig={openEditor}
      options={options}
    />
  );
};
