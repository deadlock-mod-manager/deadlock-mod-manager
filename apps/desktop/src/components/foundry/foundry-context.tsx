import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeFoundryVpk,
  decodeFoundryModel,
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

interface ModelPreview {
  status: "idle" | "loading" | "ready" | "error";
  dataUrl: string | null;
  vertexCount: number | null;
  indexCount: number | null;
}

const IDLE_TEXTURE: TexturePreview = {
  status: "idle",
  dataUrl: null,
  width: null,
  height: null,
};

const IDLE_MODEL: ModelPreview = {
  status: "idle",
  dataUrl: null,
  vertexCount: null,
  indexCount: null,
};

interface FoundryContextValue {
  status: FoundryStatus;
  manifest: FoundryManifest | null;
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  modelPreview: ModelPreview;
  setActiveTab: (tab: FoundryTab) => void;
  setSelectedEntryPath: (path: string | null) => void;
  importVpk: (filePath: string) => Promise<FoundryManifest | null>;
  importMod: (
    modId: string,
    installedVpks?: string[],
    profileFolder?: string | null,
  ) => Promise<FoundryManifest | null>;
  reset: () => void;
}

const FoundryContext = createContext<FoundryContextValue | null>(null);

const isTextureEntry = (path: string | null): path is string =>
  path?.endsWith(".vtex_c") ?? false;

const isModelEntry = (path: string | null): path is string =>
  path?.endsWith(".vmesh_c") || path?.endsWith(".vmdl_c") || false;

const getInitialModelPath = (manifest: FoundryManifest): string | null => {
  const directMesh = manifest.models.find((entry) =>
    entry.path.endsWith(".vmesh_c"),
  );
  return directMesh?.path ?? manifest.models[0]?.path ?? null;
};

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
  const [modelPreview, setModelPreview] = useState<ModelPreview>(IDLE_MODEL);
  const modelPreviewCacheRef = useRef<Map<string, ModelPreview>>(new Map());

  const reset = useCallback(() => {
    modelPreviewCacheRef.current.clear();
    setStatus("idle");
    setManifest(null);
    setError(null);
    setActiveTab("skin");
    setSelectedEntryPath(null);
    setTexturePreview(IDLE_TEXTURE);
    setModelPreview(IDLE_MODEL);
  }, []);

  const filePath = manifest?.filePath ?? null;
  useEffect(() => {
    const entryPath = selectedEntryPath;
    if (!filePath || !isTextureEntry(entryPath)) {
      setTexturePreview(IDLE_TEXTURE);
      return;
    }
    let cancelled = false;
    setTexturePreview({ ...IDLE_TEXTURE, status: "loading" });
    decodeFoundryTexture(filePath, entryPath)
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

  useEffect(() => {
    const entryPath = selectedEntryPath;
    if (!filePath || !isModelEntry(entryPath)) {
      setModelPreview(IDLE_MODEL);
      return;
    }
    const cacheKey = `${filePath}\n${entryPath}`;
    const cached = modelPreviewCacheRef.current.get(cacheKey);
    if (cached) {
      setModelPreview(cached);
      return;
    }
    let cancelled = false;
    setModelPreview({ ...IDLE_MODEL, status: "loading" });
    decodeFoundryModel(filePath, entryPath)
      .then((model) => {
        if (cancelled) return;
        const preview: ModelPreview = {
          status: "ready",
          dataUrl: model.dataUrl,
          vertexCount: model.vertexCount,
          indexCount: model.indexCount,
        };
        modelPreviewCacheRef.current.set(cacheKey, preview);
        setModelPreview(preview);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.withError(err).error("[Foundry] Failed to decode model");
        setModelPreview({ ...IDLE_MODEL, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, selectedEntryPath]);

  const importVpk = useCallback(async (filePath: string) => {
    modelPreviewCacheRef.current.clear();
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
      setSelectedEntryPath(getInitialModelPath(result));
      setActiveTab("skin");
      setStatus("ready");
      return result;
    } catch (err) {
      logger.withError(err).error("[Foundry] Failed to analyze VPK");
      setStatus("error");
      setError("analyzeFailed");
      setManifest(null);
      setSelectedEntryPath(null);
      return null;
    }
  }, []);

  const importMod = useCallback(
    async (
      modId: string,
      installedVpks: string[] = [],
      profileFolder: string | null = null,
    ) => {
      setStatus("analyzing");
      setError(null);
      try {
        const filePath = await resolveModVpk(
          modId,
          installedVpks,
          profileFolder,
        );
        return await importVpk(filePath);
      } catch (err) {
        logger.withError(err).error("[Foundry] Failed to resolve mod VPK");
        setStatus("error");
        setError("analyzeFailed");
        setManifest(null);
        setSelectedEntryPath(null);
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
      modelPreview,
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
      modelPreview,
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
