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
  analyzeDefaultFoundryHero,
  analyzeFoundryVpk,
  decodeFoundryCards,
  decodeFoundryModel,
  decodeFoundryTexture,
  resolveModVpk,
} from "@/lib/foundry";
import logger from "@/lib/logger";
import type {
  FoundryCardPreview,
  FoundryManifest,
  FoundryTab,
} from "@/types/foundry";

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

interface CardPreviews {
  status: "idle" | "loading" | "ready" | "error";
  modCards: FoundryCardPreview[];
  defaultCards: FoundryCardPreview[];
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

const IDLE_CARDS: CardPreviews = {
  status: "idle",
  modCards: [],
  defaultCards: [],
};

interface FoundryContextValue {
  status: FoundryStatus;
  manifest: FoundryManifest | null;
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  modelPreview: ModelPreview;
  cardPreviews: CardPreviews;
  selectedCardKey: string | null;
  setActiveTab: (tab: FoundryTab) => void;
  setSelectedEntryPath: (path: string | null) => void;
  previewCard: (card: FoundryCardPreview) => void;
  importVpk: (filePath: string) => Promise<FoundryManifest | null>;
  importMod: (
    modId: string,
    installedVpks?: string[],
    profileFolder?: string | null,
  ) => Promise<FoundryManifest | null>;
  importDefaultHero: (heroDisplay: string) => Promise<FoundryManifest | null>;
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
  const [cardPreviews, setCardPreviews] = useState<CardPreviews>(IDLE_CARDS);
  const [selectedTextureSource, setSelectedTextureSource] = useState<
    "manifest" | "preloadedCard"
  >("manifest");
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const texturePreviewCacheRef = useRef<Map<string, TexturePreview>>(new Map());
  const modelPreviewCacheRef = useRef<Map<string, ModelPreview>>(new Map());

  const reset = useCallback(() => {
    texturePreviewCacheRef.current.clear();
    modelPreviewCacheRef.current.clear();
    setStatus("idle");
    setManifest(null);
    setError(null);
    setActiveTab("skin");
    setSelectedEntryPath(null);
    setSelectedTextureSource("manifest");
    setSelectedCardKey(null);
    setTexturePreview(IDLE_TEXTURE);
    setModelPreview(IDLE_MODEL);
    setCardPreviews(IDLE_CARDS);
  }, []);

  const selectEntryPath = useCallback((path: string | null) => {
    setSelectedTextureSource("manifest");
    setSelectedCardKey(null);
    setSelectedEntryPath(path);
  }, []);

  const previewCard = useCallback((card: FoundryCardPreview) => {
    setSelectedTextureSource("preloadedCard");
    setSelectedCardKey(`${card.source}:${card.path}`);
    setSelectedEntryPath(card.path);
    setModelPreview(IDLE_MODEL);
    setTexturePreview({
      status: "ready",
      dataUrl: card.dataUrl,
      width: card.width,
      height: card.height,
    });
  }, []);

  const filePath = manifest?.filePath ?? null;
  useEffect(() => {
    const entryPath = selectedEntryPath;
    if (selectedTextureSource === "preloadedCard") {
      return;
    }
    if (!filePath || !isTextureEntry(entryPath)) {
      setTexturePreview(IDLE_TEXTURE);
      return;
    }
    const cacheKey = `${filePath}\n${entryPath}`;
    const cached = texturePreviewCacheRef.current.get(cacheKey);
    if (cached) {
      setTexturePreview(cached);
      return;
    }
    let cancelled = false;
    setTexturePreview({ ...IDLE_TEXTURE, status: "loading" });
    decodeFoundryTexture(filePath, entryPath)
      .then((tex) => {
        if (cancelled) return;
        const preview: TexturePreview = {
          status: "ready",
          dataUrl: tex.dataUrl,
          width: tex.width,
          height: tex.height,
        };
        texturePreviewCacheRef.current.set(cacheKey, preview);
        setTexturePreview(preview);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.withError(err).error("[Foundry] Failed to decode texture");
        setTexturePreview({ ...IDLE_TEXTURE, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, selectedEntryPath, selectedTextureSource]);

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

  useEffect(() => {
    if (!manifest) {
      setCardPreviews(IDLE_CARDS);
      return;
    }

    let cancelled = false;
    setCardPreviews({ ...IDLE_CARDS, status: "loading" });
    decodeFoundryCards(manifest.filePath, manifest.hero, manifest.heroDisplay)
      .then((cards) => {
        if (cancelled) return;
        const modCards = cards.filter((card) => card.source === "mod");
        const defaultCards = cards.filter((card) => card.source === "default");
        for (const card of modCards) {
          texturePreviewCacheRef.current.set(
            `${manifest.filePath}\n${card.path}`,
            {
              status: "ready",
              dataUrl: card.dataUrl,
              width: card.width,
              height: card.height,
            },
          );
        }
        setCardPreviews({
          status: "ready",
          modCards,
          defaultCards,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.withError(err).error("[Foundry] Failed to decode cards");
        setCardPreviews({ ...IDLE_CARDS, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  const importVpk = useCallback(
    async (filePath: string) => {
      texturePreviewCacheRef.current.clear();
      modelPreviewCacheRef.current.clear();
      setCardPreviews(IDLE_CARDS);
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
        selectEntryPath(getInitialModelPath(result));
        setActiveTab("skin");
        setStatus("ready");
        return result;
      } catch (err) {
        logger.withError(err).error("[Foundry] Failed to analyze VPK");
        setStatus("error");
        setError("analyzeFailed");
        setManifest(null);
        selectEntryPath(null);
        return null;
      }
    },
    [selectEntryPath],
  );

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
        selectEntryPath(null);
        return null;
      }
    },
    [importVpk, selectEntryPath],
  );

  const importDefaultHero = useCallback(
    async (heroDisplay: string) => {
      texturePreviewCacheRef.current.clear();
      modelPreviewCacheRef.current.clear();
      setCardPreviews(IDLE_CARDS);
      setStatus("analyzing");
      setError(null);
      try {
        const result = await analyzeDefaultFoundryHero(heroDisplay);
        setManifest(result);
        selectEntryPath(getInitialModelPath(result));
        setActiveTab("skin");
        setStatus("ready");
        return result;
      } catch (err) {
        logger.withError(err).error("[Foundry] Failed to analyze default hero");
        setStatus("error");
        setError("analyzeFailed");
        setManifest(null);
        selectEntryPath(null);
        return null;
      }
    },
    [selectEntryPath],
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
      cardPreviews,
      selectedCardKey,
      setActiveTab,
      setSelectedEntryPath: selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
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
      cardPreviews,
      selectedCardKey,
      selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
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
