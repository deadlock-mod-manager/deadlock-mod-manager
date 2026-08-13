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
  decodeFoundrySound,
  decodeFoundryTexture,
  exportFoundryWorkspace,
  foundryPaintTargets,
  paintFoundryTarget,
  prepareFoundryWorkspace,
  releaseFoundryArchives,
  replaceFoundryFile,
  resolveModVpk,
  revertFoundryFile,
} from "@/lib/foundry";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryPreviewTint } from "./foundry-model-viewer";
import type {
  FoundryCardPreview,
  FoundryExportRequest,
  FoundryExportResult,
  FoundryManifest,
  FoundryPaint,
  FoundryPaintTargetId,
  FoundryPaintResult,
  FoundryPaintTargetInfo,
  FoundryTab,
  FoundryWorkspace,
} from "@/types/foundry";

type FoundryStatus = "idle" | "analyzing" | "ready" | "error";
type AsyncStatus = "idle" | "loading" | "ready" | "error";

interface TexturePreview {
  status: AsyncStatus;
  dataUrl: string | null;
  width: number | null;
  height: number | null;
}

interface ModelPreview {
  status: AsyncStatus;
  dataUrl: string | null;
  vertexCount: number | null;
  indexCount: number | null;
}

interface CardPreviews {
  status: AsyncStatus;
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
  workspace: FoundryWorkspace | null;
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  modelPreview: ModelPreview;
  cardPreviews: CardPreviews;
  selectedCardKey: string | null;
  /** Entry paths the user has edited in this session. */
  editedPaths: ReadonlySet<string>;
  /** The model the preview defaults to and an export is named after. */
  primaryModelPath: string | null;
  setPrimaryModelPath: (path: string) => void;
  /** False when the user turned the 3D preview off; nothing is decoded then. */
  preview3dEnabled: boolean;
  /** A scene-only tint for the paint tab's live preview; never written to disk. */
  previewTint: FoundryPreviewTint | null;
  setPreviewTint: (tint: FoundryPreviewTint | null) => void;
  /** How much of the hero each paint target covers, once the skin is scanned. */
  paintTargets: FoundryPaintTargetInfo[];
  /** The paint applied per target this session, for the panel to reflect. */
  appliedPaint: Readonly<Partial<Record<FoundryPaintTargetId, FoundryPaint>>>;
  busy: boolean;
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
  replaceEntry: (entryPath: string, sourceFilePath: string) => Promise<void>;
  paintTarget: (
    target: FoundryPaintTargetId,
    paint: FoundryPaint,
  ) => Promise<FoundryPaintResult>;
  revertEntry: (entryPath: string) => Promise<void>;
  playSound: (entryPath: string) => Promise<string>;
  exportVpk: (request: FoundryExportRequest) => Promise<FoundryExportResult>;
  reset: () => void;
}

const FoundryContext = createContext<FoundryContextValue | null>(null);

const isTextureEntry = (path: string | null): path is string =>
  path?.endsWith(".vtex_c") ?? false;

const isModelEntry = (path: string | null): path is string =>
  path?.endsWith(".vmesh_c") || path?.endsWith(".vmdl_c") || false;

/**
 * The entry to show first.
 *
 * The backend resolves the hero's actual body model through the game's
 * `heroes.vdata_c`, so `primaryModelPath` is an answer rather than a guess and
 * is used whenever it is there. The local fallback only covers a manifest from
 * an older backend or a skin with no hero: a `.vmdl_c` assembles the whole
 * character, so it beats a lone `.vmesh_c`, which is one body part.
 */
const getInitialModelPath = (manifest: FoundryManifest): string | null => {
  if (manifest.primaryModelPath) return manifest.primaryModelPath;
  const model = manifest.models.find((entry) => entry.path.endsWith(".vmdl_c"));
  const mesh = manifest.models.find((entry) => entry.path.endsWith(".vmesh_c"));
  return model?.path ?? mesh?.path ?? manifest.models[0]?.path ?? null;
};

/** Every entry path a default-hero workspace has to unpack from the base pak. */
const manifestEntryPaths = (manifest: FoundryManifest): string[] =>
  [
    manifest.models,
    manifest.materials,
    manifest.textures,
    manifest.cards,
    manifest.sounds,
    manifest.other,
  ].flatMap((entries) => entries.map((entry) => entry.path));

export const FoundryProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<FoundryStatus>("idle");
  const [manifest, setManifest] = useState<FoundryManifest | null>(null);
  const [workspace, setWorkspace] = useState<FoundryWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FoundryTab>("assets");
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
  const [editedPaths, setEditedPaths] = useState<Set<string>>(new Set());
  const preview3dEnabled = usePersistedStore(
    (state) => state.foundry3dPreviewEnabled,
  );
  const [primaryModelPath, setPrimaryModelPath] = useState<string | null>(null);
  const [previewTint, setPreviewTint] = useState<FoundryPreviewTint | null>(
    null,
  );
  const [paintTargets, setPaintTargets] = useState<FoundryPaintTargetInfo[]>(
    [],
  );
  const [appliedPaint, setAppliedPaint] = useState<
    Partial<Record<FoundryPaintTargetId, FoundryPaint>>
  >({});
  const [busy, setBusy] = useState(false);
  // Bumped by every edit. Each derived preview keys its cache on it, so one
  // counter keeps the model, the textures and the card gallery in step; three
  // separate ones let them drift apart.
  const [editRevision, setEditRevision] = useState(0);
  const texturePreviewCacheRef = useRef<Map<string, TexturePreview>>(new Map());
  const modelPreviewCacheRef = useRef<Map<string, ModelPreview>>(new Map());
  const soundCacheRef = useRef<Map<string, string>>(new Map());

  const clearCaches = useCallback(() => {
    texturePreviewCacheRef.current.clear();
    modelPreviewCacheRef.current.clear();
    soundCacheRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    clearCaches();
    void releaseFoundryArchives();
    setStatus("idle");
    setManifest(null);
    setWorkspace(null);
    setError(null);
    setActiveTab("assets");
    setSelectedEntryPath(null);
    setSelectedTextureSource("manifest");
    setSelectedCardKey(null);
    setEditedPaths(new Set());
    setPrimaryModelPath(null);
    setPreviewTint(null);
    setPaintTargets([]);
    setAppliedPaint({});
    setTexturePreview(IDLE_TEXTURE);
    setModelPreview(IDLE_MODEL);
    setCardPreviews(IDLE_CARDS);
  }, [clearCaches]);

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
  const workspaceRoot = workspace?.root ?? null;

  useEffect(() => {
    const entryPath = selectedEntryPath;
    if (selectedTextureSource === "preloadedCard") {
      return;
    }
    if (!filePath || !isTextureEntry(entryPath)) {
      setTexturePreview(IDLE_TEXTURE);
      return;
    }
    const cacheKey = `${filePath}\n${entryPath}\n${editRevision}`;
    const cached = texturePreviewCacheRef.current.get(cacheKey);
    if (cached) {
      setTexturePreview(cached);
      return;
    }
    let cancelled = false;
    setTexturePreview({ ...IDLE_TEXTURE, status: "loading" });
    decodeFoundryTexture(filePath, entryPath, workspaceRoot)
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
  }, [
    filePath,
    workspaceRoot,
    selectedEntryPath,
    selectedTextureSource,
    editRevision,
  ]);

  // Which model the 3D preview shows. The paint tab always shows the primary
  // model — painting is about the character, and a sound or card selected over
  // in the asset browser must not leave the paint tab without a preview. Every
  // other tab follows the selection.
  const previewModelPath =
    activeTab === "paint" ? primaryModelPath : selectedEntryPath;

  useEffect(() => {
    const entryPath = previewModelPath;
    // Decoding a model is the slow part of opening a skin, so when the preview
    // is off it is not decoded at all rather than decoded and hidden.
    if (!preview3dEnabled || !filePath || !isModelEntry(entryPath)) {
      setModelPreview(IDLE_MODEL);
      return;
    }
    // The revision is part of the key: a repaint rewrites the textures the model
    // samples, so the same model at a new revision is a different picture.
    const cacheKey = `${filePath}\n${entryPath}\n${editRevision}`;
    const cached = modelPreviewCacheRef.current.get(cacheKey);
    if (cached) {
      setModelPreview(cached);
      return;
    }
    let cancelled = false;
    setModelPreview({ ...IDLE_MODEL, status: "loading" });
    // Without the workspace the backend decodes the packed originals and no
    // edit ever shows up in the preview.
    decodeFoundryModel(filePath, entryPath, workspaceRoot)
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
  }, [
    preview3dEnabled,
    filePath,
    workspaceRoot,
    previewModelPath,
    editRevision,
  ]);

  useEffect(() => {
    if (!manifest) {
      setCardPreviews(IDLE_CARDS);
      return;
    }

    let cancelled = false;
    setCardPreviews((current) => ({ ...current, status: "loading" }));
    decodeFoundryCards(
      manifest.filePath,
      manifest.hero,
      manifest.heroDisplay,
      workspaceRoot,
    )
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
        setCardPreviews({ status: "ready", modCards, defaultCards });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.withError(err).error("[Foundry] Failed to decode cards");
        setCardPreviews({ ...IDLE_CARDS, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [manifest, workspaceRoot, editRevision]);

  useEffect(() => {
    if (!manifest) {
      setPaintTargets([]);
      return;
    }
    let cancelled = false;
    foundryPaintTargets(manifest.filePath, workspaceRoot, manifest.heroDisplay)
      .then((targets) => {
        if (!cancelled) setPaintTargets(targets);
      })
      .catch((err) => {
        logger.withError(err).error("[Foundry] Failed to scan paint targets");
        if (!cancelled) setPaintTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [manifest, workspaceRoot]);

  /**
   * Unpack the loaded skin in the background. Editing is unavailable until this
   * lands, but previewing the model and cards is not, so a failure here is
   * logged rather than turning the whole Foundry into an error state.
   */
  const openWorkspace = useCallback(async (loaded: FoundryManifest) => {
    const name = loaded.heroDisplay ?? loaded.hero ?? "skin";
    // A default-hero source is the shared multi-GB base pak; only that hero's
    // listed assets are unpacked from it.
    const entries =
      loaded.models[0]?.source === "default"
        ? manifestEntryPaths(loaded)
        : null;
    try {
      setWorkspace(
        await prepareFoundryWorkspace(loaded.filePath, name, entries),
      );
    } catch (err) {
      logger.withError(err).error("[Foundry] Failed to prepare workspace");
      setWorkspace(null);
    }
  }, []);

  const loadManifest = useCallback(
    async (load: () => Promise<FoundryManifest>, requireHeroSkin: boolean) => {
      clearCaches();
      setCardPreviews(IDLE_CARDS);
      setWorkspace(null);
      setEditedPaths(new Set());
      setStatus("analyzing");
      setError(null);
      try {
        const result = await load();
        if (requireHeroSkin && !result.isHeroSkin) {
          setStatus("error");
          setError("notHeroSkin");
          setManifest(null);
          return null;
        }
        setManifest(result);
        const initialModel = getInitialModelPath(result);
        setPrimaryModelPath(initialModel);
        selectEntryPath(initialModel);
        setActiveTab("assets");
        setStatus("ready");
        void openWorkspace(result);
        return result;
      } catch (err) {
        logger.withError(err).error("[Foundry] Failed to load skin");
        setStatus("error");
        setError("analyzeFailed");
        setManifest(null);
        selectEntryPath(null);
        return null;
      }
    },
    [clearCaches, openWorkspace, selectEntryPath],
  );

  const importVpk = useCallback(
    (path: string) => loadManifest(() => analyzeFoundryVpk(path), true),
    [loadManifest],
  );

  const importMod = useCallback(
    (
      modId: string,
      installedVpks: string[] = [],
      profileFolder: string | null = null,
    ) =>
      loadManifest(async () => {
        const resolved = await resolveModVpk(
          modId,
          installedVpks,
          profileFolder,
        );
        return await analyzeFoundryVpk(resolved);
      }, true),
    [loadManifest],
  );

  const importDefaultHero = useCallback(
    (heroDisplay: string) =>
      loadManifest(() => analyzeDefaultFoundryHero(heroDisplay), false),
    [loadManifest],
  );

  /** Drop every cached decode of one entry so the next read sees the edit. */
  const invalidateEntry = useCallback(
    (entryPath: string) => {
      if (!filePath) return;
      const cacheKey = `${filePath}\n${entryPath}`;
      texturePreviewCacheRef.current.delete(cacheKey);
      modelPreviewCacheRef.current.delete(cacheKey);
      soundCacheRef.current.delete(cacheKey);
    },
    [filePath],
  );

  const afterEdit = useCallback(
    (entryPath: string, edited: boolean) => {
      invalidateEntry(entryPath);
      setEditedPaths((current) => {
        const next = new Set(current);
        if (edited) {
          next.add(entryPath);
        } else {
          next.delete(entryPath);
        }
        return next;
      });
      if (entryPath.endsWith(".vtex_c")) {
        setSelectedTextureSource("manifest");
      }
      setEditRevision((revision) => revision + 1);
    },
    [invalidateEntry],
  );

  const requireWorkspace = useCallback((): FoundryWorkspace => {
    if (!workspace) {
      throw new Error("The Foundry workspace is not ready yet.");
    }
    return workspace;
  }, [workspace]);

  const replaceEntry = useCallback(
    async (entryPath: string, sourceFilePath: string) => {
      const active = requireWorkspace();
      setBusy(true);
      try {
        await replaceFoundryFile(
          active.root,
          entryPath,
          sourceFilePath,
          filePath,
        );
        afterEdit(entryPath, true);
      } finally {
        setBusy(false);
      }
    },
    [afterEdit, filePath, requireWorkspace],
  );

  const paintTarget = useCallback(
    async (target: FoundryPaintTargetId, paint: FoundryPaint) => {
      const active = requireWorkspace();
      if (!filePath) {
        throw new Error("No skin is loaded.");
      }
      setBusy(true);
      try {
        const result = await paintFoundryTarget(
          active.root,
          filePath,
          target,
          manifest?.heroDisplay ?? null,
          paint,
        );
        setEditedPaths((current) => {
          const next = new Set(current);
          for (const path of result.paintedPaths) next.add(path);
          return next;
        });
        setAppliedPaint((current) => ({ ...current, [target]: paint }));
        // A repaint changes what the model samples and what the cards show.
        modelPreviewCacheRef.current.clear();
        texturePreviewCacheRef.current.clear();
        setEditRevision((revision) => revision + 1);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [filePath, manifest, requireWorkspace],
  );

  const revertEntry = useCallback(
    async (entryPath: string) => {
      const active = requireWorkspace();
      setBusy(true);
      try {
        await revertFoundryFile(active.root, entryPath, filePath);
        afterEdit(entryPath, false);
      } finally {
        setBusy(false);
      }
    },
    [afterEdit, filePath, requireWorkspace],
  );

  const playSound = useCallback(
    async (entryPath: string) => {
      if (!filePath) {
        throw new Error("No skin is loaded.");
      }
      const cacheKey = `${filePath}\n${entryPath}`;
      const cached = soundCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const preview = await decodeFoundrySound(
        filePath,
        entryPath,
        workspaceRoot,
      );
      soundCacheRef.current.set(cacheKey, preview.dataUrl);
      return preview.dataUrl;
    },
    [filePath, workspaceRoot],
  );

  const exportVpk = useCallback(
    async (request: FoundryExportRequest) => {
      const active = requireWorkspace();
      setBusy(true);
      try {
        return await exportFoundryWorkspace(active.root, {
          ...request,
          name: request.name ?? manifest?.heroDisplay ?? manifest?.hero ?? null,
          sourcePath: request.sourcePath ?? manifest?.sourcePath ?? null,
        });
      } finally {
        setBusy(false);
      }
    },
    [manifest, requireWorkspace],
  );

  const value = useMemo<FoundryContextValue>(
    () => ({
      status,
      manifest,
      workspace,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      primaryModelPath,
      setPrimaryModelPath,
      preview3dEnabled,
      // Scoped to the paint tab at the source. The tab panels are all mounted
      // at once (the inactive ones are only hidden with CSS), so the paint
      // panel's effects run even while the user is looking at the asset
      // browser. Gating the tint here means no panel can colour a preview
      // outside the tab that owns the control.
      previewTint: activeTab === "paint" ? previewTint : null,
      setPreviewTint,
      paintTargets,
      appliedPaint,
      busy,
      setActiveTab,
      setSelectedEntryPath: selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
      replaceEntry,
      paintTarget,
      revertEntry,
      playSound,
      exportVpk,
      reset,
    }),
    [
      status,
      manifest,
      workspace,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      primaryModelPath,
      preview3dEnabled,
      previewTint,
      paintTargets,
      appliedPaint,
      busy,
      selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
      replaceEntry,
      paintTarget,
      revertEntry,
      playSound,
      exportVpk,
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
