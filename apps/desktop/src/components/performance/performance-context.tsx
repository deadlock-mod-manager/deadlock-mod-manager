import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { EditorDraftsProvider } from "@/components/performance/settings-editor/editor-drafts-context";
import type { ImportSource } from "@/types/generated/ImportSource";

const PERFORMANCE_TABS = [
  "configs",
  "editor",
  "history",
  "howItWorks",
] as const;

type PerformanceTab = (typeof PERFORMANCE_TABS)[number];

export const isPerformanceTab = (value: string): value is PerformanceTab =>
  PERFORMANCE_TABS.some((tab) => tab === value);

type PerformanceUi = {
  tab: PerformanceTab;
  setTab: (tab: PerformanceTab) => void;
  /** Config whose details sheet is open (`preset:<id>`, `user:<uuid>` or `community:<id>`). */
  detailsConfigId: string | null;
  openDetails: (configId: string | null) => void;
  importSource: ImportSource | null;
  importOpen: boolean;
  openImport: (source?: ImportSource) => void;
  closeImport: () => void;
  /** Config the settings editor shows; `null` follows the applied config. */
  editorConfigId: string | null;
  openEditor: (configId?: string | null) => void;
};

const PerformanceUiContext = createContext<PerformanceUi | null>(null);

export const PerformanceUiProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [tab, setTab] = useState<PerformanceTab>("configs");
  const [detailsConfigId, openDetails] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [editorConfigId, setEditorConfigId] = useState<string | null>(null);

  const value = useMemo<PerformanceUi>(
    () => ({
      tab,
      setTab,
      detailsConfigId,
      openDetails,
      importSource,
      importOpen,
      openImport: (source) => {
        setImportSource(source ?? null);
        setImportOpen(true);
      },
      closeImport: () => {
        setImportOpen(false);
        setImportSource(null);
      },
      editorConfigId,
      openEditor: (configId) => {
        setEditorConfigId(configId ?? null);
        setTab("editor");
      },
    }),
    [tab, detailsConfigId, importSource, importOpen, editorConfigId],
  );

  return (
    <PerformanceUiContext.Provider value={value}>
      <EditorDraftsProvider>{children}</EditorDraftsProvider>
    </PerformanceUiContext.Provider>
  );
};

export const usePerformanceUi = () => {
  const context = useContext(PerformanceUiContext);
  if (!context) {
    throw new Error(
      "usePerformanceUi must be used inside PerformanceUiProvider",
    );
  }
  return context;
};
