import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  HeroConflictDialog,
  type HeroConflictResolution,
} from "@/components/mod-browsing/hero-conflict-dialog";
import { resolveLocalModHero } from "@/lib/mods/hero-resolution";
import type { ModelConflictChoice } from "@/lib/mods/model-conflict-install";
import type { LocalMod } from "@/types/mods";

interface ModelConflictRequest {
  id: number;
  mod: LocalMod;
  conflicts: LocalMod[];
  resolve: (choice: ModelConflictChoice | null) => void;
}

type AskModelConflict = (
  mod: LocalMod,
  conflicts: LocalMod[],
) => Promise<ModelConflictChoice | null>;

const ModelConflictContext = createContext<AskModelConflict | null>(null);

const CHOICES = {
  swap: "replace",
  "enable-both": "keepBoth",
  cancel: null,
} satisfies Record<HeroConflictResolution, ModelConflictChoice | null>;

export function ModelConflictProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ModelConflictRequest | null>(null);
  const activeRequest = useRef<ModelConflictRequest | null>(null);
  const nextId = useRef(0);

  const finish = useCallback((resolution: HeroConflictResolution) => {
    activeRequest.current?.resolve(CHOICES[resolution]);
    activeRequest.current = null;
    setRequest(null);
  }, []);

  const ask = useCallback<AskModelConflict>((mod, conflicts) => {
    activeRequest.current?.resolve(null);
    return new Promise((resolve) => {
      const next = { id: ++nextId.current, mod, conflicts, resolve };
      activeRequest.current = next;
      setRequest(next);
    });
  }, []);

  useEffect(
    () => () => {
      activeRequest.current?.resolve(null);
      activeRequest.current = null;
    },
    [],
  );

  return (
    <ModelConflictContext.Provider value={ask}>
      {children}
      {request ? (
        <HeroConflictDialog
          key={request.id}
          currentMod={request.conflicts[0] ?? null}
          heroName={resolveLocalModHero(request.mod).hero ?? null}
          newMod={request.mod}
          onResolve={finish}
          open
          otherCurrentCount={request.conflicts.length - 1}
        />
      ) : null}
    </ModelConflictContext.Provider>
  );
}

export function useModelConflictPrompt() {
  const ask = useContext(ModelConflictContext);
  if (!ask) {
    throw new Error("useModelConflictPrompt requires ModelConflictProvider");
  }
  return ask;
}
