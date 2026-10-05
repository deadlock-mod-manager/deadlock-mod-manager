import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { modById, PREVIEW_MODS, type PreviewMod } from "./mods";

type InstallState =
  | { status: "downloading"; progress: number }
  | { status: "installed"; enabled: boolean };

type Toast = { id: number; title: string; description: string };

export type Appearance = { geometry: boolean; animateGeometry: boolean };

type PreviewState = {
  appearance: Appearance;
  setAppearance: (next: Partial<Appearance>) => void;
  installs: Record<string, InstallState>;
  activeSkins: Record<string, string | null>;
  toast: Toast | null;
  download: (mod: PreviewMod) => void;
  toggle: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  remove: (id: string) => void;
  setActiveSkin: (hero: string, id: string | null) => void;
  notify: (title: string, description: string) => void;
};

const INITIAL_INSTALLS = {
  "623518": { status: "installed", enabled: true },
  "601444": { status: "installed", enabled: true },
  "691863": { status: "installed", enabled: true },
  "655209": { status: "installed", enabled: false },
} satisfies Record<string, InstallState>;

const PreviewStateContext = createContext<PreviewState | null>(null);

export const PreviewStateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [installs, setInstalls] =
    useState<Record<string, InstallState>>(INITIAL_INSTALLS);
  const [activeSkins, setActiveSkins] = useState<Record<string, string | null>>(
    { Yamato: "691863" },
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>({
    geometry: true,
    animateGeometry: true,
  });
  const toastId = useRef(0);

  const notify = useCallback((title: string, description: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, title, description });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const isDownloading = Object.values(installs).some(
    (install) => install.status === "downloading",
  );

  const installsRef = useRef(installs);
  installsRef.current = installs;

  // Fake download progress; finished mods install and enable themselves.
  useEffect(() => {
    if (!isDownloading) return;
    const interval = window.setInterval(() => {
      const next = { ...installsRef.current };
      for (const [id, install] of Object.entries(next)) {
        if (install.status !== "downloading") continue;
        const progress = install.progress + 9 + Math.random() * 10;
        if (progress < 100) {
          next[id] = { status: "downloading", progress };
          continue;
        }
        next[id] = { status: "installed", enabled: true };
        const mod = modById(id);
        if (mod) notify("Mod installed", `${mod.name} is ready to play.`);
      }
      installsRef.current = next;
      setInstalls(next);
    }, 160);
    return () => window.clearInterval(interval);
  }, [isDownloading, notify]);

  const value = useMemo<PreviewState>(
    () => ({
      appearance,
      setAppearance: (next) =>
        setAppearanceState((current) => ({ ...current, ...next })),
      installs,
      activeSkins,
      toast,
      notify,
      download: (mod) =>
        setInstalls((current) =>
          current[mod.id]
            ? current
            : { ...current, [mod.id]: { status: "downloading", progress: 0 } },
        ),
      toggle: (id) =>
        setInstalls((current) => {
          const install = current[id];
          if (install?.status !== "installed") return current;
          return {
            ...current,
            [id]: { ...install, enabled: !install.enabled },
          };
        }),
      setEnabled: (id, enabled) =>
        setInstalls((current) => {
          const install = current[id];
          if (install?.status !== "installed" || install.enabled === enabled) {
            return current;
          }
          return { ...current, [id]: { ...install, enabled } };
        }),
      remove: (id) => {
        setInstalls(({ [id]: _removed, ...rest }) => rest);
        setActiveSkins((current) =>
          Object.fromEntries(
            Object.entries(current).map(([hero, skin]) => [
              hero,
              skin === id ? null : skin,
            ]),
          ),
        );
      },
      setActiveSkin: (hero, id) =>
        setActiveSkins((current) => ({ ...current, [hero]: id })),
    }),
    [appearance, installs, activeSkins, toast, notify],
  );

  return (
    <PreviewStateContext.Provider value={value}>
      {children}
    </PreviewStateContext.Provider>
  );
};

export const usePreviewState = () => {
  const context = useContext(PreviewStateContext);
  if (!context) {
    throw new Error("usePreviewState must be used inside PreviewStateProvider");
  }
  return context;
};

export const useInstalledMods = () => {
  const { installs } = usePreviewState();
  return PREVIEW_MODS.filter((mod) => installs[mod.id]?.status === "installed");
};

export const formatCount = (value: number) => value.toLocaleString("en-US");

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
