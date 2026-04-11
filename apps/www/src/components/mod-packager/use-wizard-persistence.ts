import { useCallback, useEffect, useRef } from "react";
import type { ModConfig } from "@deadlock-mods/dmodpkg";

const STORAGE_KEY = "mod-packager-draft";

interface PersistedState {
  currentStep: number;
  formData: Partial<ModConfig>;
  zipFileList: string[];
  savedAt: string;
}

export function useWizardPersistence() {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const load = useCallback((): PersistedState | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const save = useCallback((state: Omit<PersistedState, "savedAt">) => {
    if (typeof window === "undefined") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const persisted: PersistedState = {
          ...state,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        // localStorage may be full or unavailable
      }
    }, 500);
  }, []);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const hasDraft = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) !== null;
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { load, save, clear, hasDraft };
}
