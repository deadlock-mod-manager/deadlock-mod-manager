import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  analyzeFoundryVpk,
  decodeFoundryTexture,
  resolveModVpk,
} from "@/lib/foundry";
import logger from "@/lib/logger";
import type { FoundryManifest, FoundryTab } from "@/types/foundry";

type FoundryStatus = "idle" | "analyzing" | "ready" | "error";

interface TexturePreview {
  status: "idle" | "loading" | "ready" | "error";
  dataUrl: string | null;
  width: number | null;
  height: number | null;
}

const IDLE_TEXTURE: TexturePreview = {
  status: "idle",
  dataUrl: null,
  width: null,
  height: null,
};

interface FoundryContextValue {
  status: FoundryStatus;
  manifest: FoundryManifest | null;
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  setActiveTab: (tab: FoundryTab) => void;
  setSelectedEntryPath: (path: string | null) => void;
  importVpk: (filePath: string) => Promise<FoundryManifest | null>;
  importMod: (modId: string) => Promise<FoundryManifest | null>;
  reset: () => void;
}

const FoundryContext = createContext<FoundryContextValue | null>(null);

export const FoundryProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<FoundryStatus>("idle");
  const [manifest, setManifest] = useState<FoundryManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FoundryTab>("skin");
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(
    null,
  );
  const [texturePreview, setTexturePreview] =
    useState<TexturePreview>(IDLE_TEXTURE);

  const reset = useCallback(() => {
    setStatus("idle");
    setManifest(null);
    setError(null);
    setActiveTab("skin");
    setSelectedEntryPath(null);
    setTexturePreview(IDLE_TEXTURE);
  }, []);

  // Decode the selected texture / card entry to a PNG for the center preview.
  // Non-texture selections (models, sounds, particles) leave the preview idle.
  const filePath = manifest?.filePath ?? null;
  useEffect(() => {
    if (!filePath || !selectedEntryPath?.endsWith(".vtex_c")) {
      setTexturePreview(IDLE_TEXTURE);
      return;
    }
    let cancelled = false;
    setTexturePreview({ ...IDLE_TEXTURE, status: "loading" });
    decodeFoundryTexture(filePath, selectedEntryPath)
      .then((tex) => {
        if (cancelled) return;
        setTexturePreview({
          status: "ready",
          dataUrl: tex.dataUrl,
          width: tex.width,
          height: tex.height,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.withError(err).error("[Foundry] Failed to decode texture");
        setTexturePreview({ ...IDLE_TEXTURE, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, selectedEntryPath]);

  const importVpk = useCallback(async (filePath: string) => {
    setStatus("analyzing");
    setError(null);
    try {
      const result = await analyzeFoundryVpk(filePath);
      if (!result.isHeroSkin) {
        setStatus("error");
        setError("notHeroSkin");
        setManifest(null);
        return null;
      }
      setManifest(result);
      setSelectedEntryPath(null);
      setActiveTab("skin");
      setStatus("ready");
      return result;
    } catch (err) {
      logger.withError(err).error("[Foundry] Failed to analyze VPK");
      setStatus("error");
      setError("analyzeFailed");
      setManifest(null);
      return null;
    }
  }, []);

  const importMod = useCallback(
    async (modId: string) => {
      setStatus("analyzing");
      setError(null);
      try {
        const filePath = await resolveModVpk(modId);
        return await importVpk(filePath);
      } catch (err) {
        logger.withError(err).error("[Foundry] Failed to resolve mod VPK");
        setStatus("error");
        setError("analyzeFailed");
        setManifest(null);
        return null;
      }
    },
    [importVpk],
  );

  const value = useMemo<FoundryContextValue>(
    () => ({
      status,
      manifest,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      setActiveTab,
      setSelectedEntryPath,
      importVpk,
      importMod,
      reset,
    }),
    [
      status,
      manifest,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      importVpk,
      importMod,
      reset,
    ],
  );

  return (
    <FoundryContext.Provider value={value}>{children}</FoundryContext.Provider>
  );
};

export const useFoundry = (): FoundryContextValue => {
  const ctx = useContext(FoundryContext);
  if (!ctx) {
    throw new Error("useFoundry must be used within a FoundryProvider");
  }
  return ctx;
};
