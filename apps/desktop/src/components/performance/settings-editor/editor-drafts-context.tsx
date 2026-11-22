import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { EditorDraft } from "@/lib/performance/editor/draft";

type DraftUpdater = (current: EditorDraft | undefined) => EditorDraft | null;

type EditorDrafts = {
  /** Unsaved edits per config id. A config without an entry shows its saved tweaks. */
  drafts: Record<string, EditorDraft>;
  /** Return `null` to drop the draft. */
  updateDraft: (configId: string, updater: DraftUpdater) => void;
};

const EditorDraftsContext = createContext<EditorDrafts | null>(null);

/**
 * Holds the settings editor's unsaved edits above the tabs, so switching tabs
 * keeps them while the Performance page stays mounted.
 */
export const EditorDraftsProvider = ({ children }: { children: ReactNode }) => {
  const [drafts, setDrafts] = useState<Record<string, EditorDraft>>({});

  const updateDraft = useCallback(
    (configId: string, updater: DraftUpdater) =>
      setDrafts((current) => {
        const next = updater(current[configId]);
        if (next === null) {
          if (!(configId in current)) return current;
          const { [configId]: _dropped, ...rest } = current;
          return rest;
        }
        return { ...current, [configId]: next };
      }),
    [],
  );

  const value = useMemo(() => ({ drafts, updateDraft }), [drafts, updateDraft]);

  return (
    <EditorDraftsContext.Provider value={value}>
      {children}
    </EditorDraftsContext.Provider>
  );
};

export const useEditorDrafts = () => {
  const context = useContext(EditorDraftsContext);
  if (!context) {
    throw new Error("useEditorDrafts must be used inside EditorDraftsProvider");
  }
  return context;
};
