import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { analytics } from "@/lib/analytics";
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
  adjustFoundrySound,
  analyzeDefaultFoundryHero,
  analyzeFoundryVpk,
  decodeFoundryCards,
  decodeFoundryModel,
  decodeFoundrySound,
  decodeFoundryTexture,
  exportFoundryWorkspace,
  foundryModelParts,
  foundryPaintTargets,
  getPrimaryModelPath,
  paintFoundryParts,
  paintFoundryTarget,
  prepareFoundryWorkspace,
  releaseFoundryArchives,
  removeFoundryParts,
  replaceFoundryFile,
  resolveModVpk,
  revertFoundryFile,
} from "@/lib/foundry";
import logger from "@/lib/logger";
import { releaseFoundryModel } from "@/lib/model-assets";
import type {
  FoundryPreviewTint,
  FoundryTextureRefresh,
} from "./foundry-model-viewer";
import { createTexturePreviewCache } from "./texture-preview-cache";
import type {
  FoundryCardPreview,
  FoundryExportRequest,
  FoundryExportResult,
  FoundryManifest,
  FoundryModel,
  FoundryPaint,
  FoundryPaintPart,
  FoundryPaintSelection,
  FoundryPaintTargetId,
  FoundryPaintResult,
  FoundryPaintTargetInfo,
  FoundryRemovedParts,
  FoundrySoundSettings,
  FoundryTab,
  FoundryWorkspace,
} from "@/types/foundry";
import { FOUNDRY_PATTERNS } from "@/types/foundry";

type FoundryStatus = "idle" | "analyzing" | "ready" | "error";

const FOUNDRY_EDIT_KEY = ["foundry-edit"];

const useFoundryEdit = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) =>
  useMutation({
    mutationKey: FOUNDRY_EDIT_KEY,
    networkMode: "always",
    meta: { skipGlobalErrorHandler: true },
    mutationFn,
  }).mutateAsync;

type AsyncStatus = "idle" | "loading" | "ready" | "error";

interface TexturePreview {
  status: AsyncStatus;
  dataUrl: string | null;
  width: number | null;
  height: number | null;
}

interface ModelPreview {
  status: AsyncStatus;
  model: FoundryModel | null;
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
  model: null,
  vertexCount: null,
  indexCount: null,
};

const IDLE_CARDS: CardPreviews = {
  status: "idle",
  modCards: [],
  defaultCards: [],
};

const MODEL_TARGETS: FoundryPaintTargetId[] = [
  "body",
  "weapon",
  "bodyAndWeapon",
];

export type FoundrySoundAdjust = Pick<
  FoundrySoundSettings,
  "gainDb" | "normalize" | "mute"
>;

export const NO_SOUND_ADJUST: FoundrySoundAdjust = {
  gainDb: 0,
  normalize: false,
  mute: false,
};

const isNoSoundAdjust = (adjust: FoundrySoundAdjust) =>
  adjust.gainDb === 0 && !adjust.normalize && !adjust.mute;

const DEFAULT_SELECTION: FoundryPaintSelection = {
  kind: "parts",
  textures: [],
};

const fileStem = (path: string) =>
  path
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.vpk$/i, "") ?? path;

export interface FoundrySkinOrigin {
  kind: "mod" | "default" | "file";
  name: string;
  author: string | null;
  imageUrl: string | null;
}

export const targetPaintKey = (target: FoundryPaintTargetId) =>
  `target:${target}`;
export const partPaintKey = (texture: string) => `part:${texture}`;

export const selectionTextures = (
  selection: FoundryPaintSelection,
  parts: readonly FoundryPaintPart[],
): string[] => {
  if (selection.kind === "parts") return selection.textures;
  switch (selection.target) {
    case "abilities":
      return [];
    case "bodyAndWeapon":
      return parts.map((part) => part.texture);
    default:
      return parts
        .filter((part) => part.target === selection.target)
        .map((part) => part.texture);
  }
};

const withPaintedSections = (
  applied: Readonly<Record<string, FoundryPaint>>,
  paintedPaths: readonly string[],
  paint: FoundryPaint,
  parts: readonly FoundryPaintPart[],
) => {
  const next = { ...applied };
  const painted = new Set(paintedPaths);
  for (const texture of paintedPaths) next[partPaintKey(texture)] = paint;
  for (const target of MODEL_TARGETS) {
    if (
      selectionTextures({ kind: "target", target }, parts).some((texture) =>
        painted.has(texture),
      )
    ) {
      delete next[targetPaintKey(target)];
    }
  }
  return next;
};

interface FoundryContextValue {
  status: FoundryStatus;
  manifest: FoundryManifest | null;
  skinOrigin: FoundrySkinOrigin | null;
  workspace: FoundryWorkspace | null;
  workspacePreparationFailed: boolean;
  retryWorkspacePreparation: () => void;
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  modelPreview: ModelPreview;
  cardPreviews: CardPreviews;
  selectedCardKey: string | null;
  editedPaths: ReadonlySet<string>;
  editRevision: number;
  textureRefresh: FoundryTextureRefresh;
  viewerReady: boolean;
  setViewerReady: (ready: boolean) => void;
  registerHeroCapture: (capture: (() => Promise<Blob | null>) | null) => void;
  captureHero: () => Promise<string | null>;
  soundSettings: ReadonlyMap<string, FoundrySoundSettings>;
  primaryModelPath: string | null;
  setPrimaryModelPath: (path: string) => void;
  previewTint: readonly FoundryPreviewTint[] | null;
  setPreviewTint: (tint: readonly FoundryPreviewTint[] | null) => void;
  paintTargets: FoundryPaintTargetInfo[];
  appliedPaint: Readonly<Record<string, FoundryPaint>>;
  paintParts: FoundryPaintPart[];
  paintSelection: FoundryPaintSelection;
  setPaintSelection: (selection: FoundryPaintSelection) => void;
  togglePaintPart: (texture: string, additive: boolean) => void;
  highlightTextures: readonly string[];
  hiddenParts: readonly string[];
  toggleHiddenPart: (texture: string) => void;
  removedParts: Readonly<Record<string, FoundryRemovedParts>>;
  toggleRemovedPart: (texture: string) => Promise<void>;
  busy: boolean;
  setActiveTab: (tab: FoundryTab) => void;
  setSelectedEntryPath: (path: string | null) => void;
  previewCard: (card: FoundryCardPreview) => void;
  importVpk: (filePath: string) => Promise<FoundryManifest | null>;
  importMod: (
    modId: string,
    installedVpks: string[],
    profileFolder: string | null,
    origin: FoundrySkinOrigin,
  ) => Promise<FoundryManifest | null>;
  importDefaultHero: (
    heroDisplay: string,
    imageUrl: string | null,
  ) => Promise<FoundryManifest | null>;
  replaceEntry: (entryPath: string, sourceFilePath: string) => Promise<void>;
  paintTarget: (
    target: FoundryPaintTargetId,
    paint: FoundryPaint,
  ) => Promise<FoundryPaintResult>;
  paintSelectedParts: (
    textures: string[],
    paint: FoundryPaint,
  ) => Promise<FoundryPaintResult>;
  revertEntry: (entryPath: string) => Promise<void>;
  adjustSound: (entryPath: string, adjust: FoundrySoundAdjust) => Promise<void>;
  playSound: (entryPath: string, original?: boolean) => Promise<string>;
  exportVpk: (request: FoundryExportRequest) => Promise<FoundryExportResult>;
  reset: () => void;
}

const FoundryContext = createContext<FoundryContextValue | null>(null);

const LIVE_SWAPPED = [".vtex_c", ".vsnd_c", ".vpcf_c"];

const isTextureEntry = (path: string | null): path is string =>
  path?.endsWith(".vtex_c") ?? false;

const isModelEntry = (path: string | null): path is string =>
  path?.endsWith(".vmesh_c") || path?.endsWith(".vmdl_c") || false;

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
  const [skinOrigin, setSkinOrigin] = useState<FoundrySkinOrigin | null>(null);
  const [workspace, setWorkspace] = useState<FoundryWorkspace | null>(null);
  const workspaceSessionRef = useRef(0);
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
  const [soundSettings, setSoundSettings] = useState<
    Map<string, FoundrySoundSettings>
  >(new Map());
  const [primaryModelPath, setPrimaryModelPath] = useState<string | null>(null);
  const [previewTint, setPreviewTint] = useState<
    readonly FoundryPreviewTint[] | null
  >(null);
  const [paintTargets, setPaintTargets] = useState<FoundryPaintTargetInfo[]>(
    [],
  );
  const [appliedPaint, setAppliedPaint] = useState<
    Record<string, FoundryPaint>
  >({});
  const [paintParts, setPaintParts] = useState<FoundryPaintPart[]>([]);
  const [paintSelection, setPaintSelection] =
    useState<FoundryPaintSelection>(DEFAULT_SELECTION);
  const busy = useIsMutating({ mutationKey: FOUNDRY_EDIT_KEY }) > 0;
  const [hiddenParts, setHiddenParts] = useState<string[]>([]);
  const [removedParts, setRemovedParts] = useState<
    Record<string, FoundryRemovedParts>
  >({});
  const [editRevision, setEditRevision] = useState(0);
  const [modelRevision, setModelRevision] = useState(0);
  const [textureRefresh, setTextureRefresh] = useState<FoundryTextureRefresh>({
    paths: [],
    revision: 0,
  });
  const [viewerReady, setViewerReady] = useState(false);
  const heroCaptureRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const registerHeroCapture = useCallback(
    (capture: (() => Promise<Blob | null>) | null) => {
      heroCaptureRef.current = capture;
    },
    [],
  );
  const captureHero = useCallback(async () => {
    const still = await heroCaptureRef.current?.();
    return still ? URL.createObjectURL(still) : null;
  }, []);
  const afterContentChange = useCallback((paths: readonly string[]) => {
    const textures = paths.filter((path) => path.endsWith(".vtex_c"));
    if (textures.length > 0) {
      setTextureRefresh((current) => ({
        paths: textures,
        revision: current.revision + 1,
      }));
    }
    if (paths.some((path) => !LIVE_SWAPPED.some((ext) => path.endsWith(ext)))) {
      setModelRevision((revision) => revision + 1);
    }
    setEditRevision((revision) => revision + 1);
  }, []);
  const texturePreviewCacheRef = useRef(
    createTexturePreviewCache<TexturePreview>(),
  );
  const soundCacheRef = useRef<Map<string, string>>(new Map());

  const clearCaches = useCallback(() => {
    texturePreviewCacheRef.current.clear();
    soundCacheRef.current.clear();
  }, []);

  const {
    mutate: openWorkspace,
    reset: resetWorkspacePreparation,
    isError: workspacePreparationFailed,
  } = useMutation({
    networkMode: "always",
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (loaded: FoundryManifest) => {
      const session = workspaceSessionRef.current;
      const name = loaded.heroDisplay ?? loaded.hero ?? "skin";
      const entries =
        loaded.models[0]?.source === "default"
          ? manifestEntryPaths(loaded)
          : null;
      const prepared = await prepareFoundryWorkspace(
        loaded.filePath,
        name,
        entries,
      );
      if (session !== workspaceSessionRef.current) return;
      setEditedPaths(new Set(prepared.editedPaths));
      setSoundSettings(
        new Map(
          prepared.soundSettings.map((sound) => [sound.entryPath, sound]),
        ),
      );
      setAppliedPaint(
        Object.fromEntries(
          prepared.appliedPaint.map((applied) => [
            partPaintKey(applied.entryPath),
            {
              colorHex: applied.colorHex,
              saturation: applied.saturation,
              brightness: applied.brightness,
              pattern:
                FOUNDRY_PATTERNS.find((id) => id === applied.pattern) ?? "none",
              patternIntensity: applied.patternIntensity,
              patternPhase: applied.patternPhase,
            },
          ]),
        ),
      );
      setRemovedParts(
        Object.fromEntries(
          prepared.removedParts.map((removed) => [removed.modelPath, removed]),
        ),
      );
      setWorkspace(prepared);
    },
    onError: (err, loaded) => {
      logger
        .withMetadata({ filePath: loaded.filePath })
        .withError(err)
        .error("[Foundry] Failed to prepare workspace");
    },
  });

  const retryWorkspacePreparation = useCallback(() => {
    if (manifest) openWorkspace(manifest);
  }, [manifest, openWorkspace]);

  const reset = useCallback(() => {
    workspaceSessionRef.current += 1;
    resetWorkspacePreparation();
    clearCaches();
    void releaseFoundryArchives();
    setStatus("idle");
    setManifest(null);
    setSkinOrigin(null);
    setWorkspace(null);
    setError(null);
    setActiveTab("assets");
    setSelectedEntryPath(null);
    setSelectedTextureSource("manifest");
    setSelectedCardKey(null);
    setEditedPaths(new Set());
    setSoundSettings(new Map());
    setPrimaryModelPath(null);
    setPreviewTint(null);
    setPaintTargets([]);
    setAppliedPaint({});
    setPaintParts([]);
    setPaintSelection(DEFAULT_SELECTION);
    setHiddenParts([]);
    setRemovedParts({});
    setTexturePreview(IDLE_TEXTURE);
    setModelPreview(IDLE_MODEL);
    setCardPreviews(IDLE_CARDS);
  }, [clearCaches, resetWorkspacePreparation]);

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
    texturePreviewCacheRef.current.setRevision(editRevision);
  }, [editRevision]);

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
    const cached = texturePreviewCacheRef.current.get(cacheKey, editRevision);
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
        texturePreviewCacheRef.current.set(cacheKey, editRevision, preview);
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

  const previewModelPath =
    activeTab === "paint" ? primaryModelPath : selectedEntryPath;

  useEffect(() => {
    const entryPath = previewModelPath;
    if (!filePath || !isModelEntry(entryPath)) {
      setModelPreview(IDLE_MODEL);
      return;
    }
    const controller = new AbortController();
    let ownedModel: FoundryModel | null = null;
    setModelPreview({ ...IDLE_MODEL, status: "loading" });
    decodeFoundryModel(filePath, entryPath, workspaceRoot, controller.signal)
      .then((model) => {
        if (controller.signal.aborted) {
          releaseFoundryModel(model);
          return;
        }
        ownedModel = model;
        setModelPreview({
          status: "ready",
          model,
          vertexCount: model.vertexCount,
          indexCount: model.indexCount,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logger.withError(err).error("[Foundry] Failed to decode model");
        setModelPreview({ ...IDLE_MODEL, status: "error" });
      });
    return () => {
      controller.abort();
      if (ownedModel) releaseFoundryModel(ownedModel);
    };
  }, [filePath, workspaceRoot, previewModelPath, modelRevision]);

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

  useEffect(() => {
    setPaintSelection(DEFAULT_SELECTION);
    if (!manifest || !primaryModelPath) {
      setPaintParts([]);
      return;
    }
    let cancelled = false;
    foundryModelParts(
      manifest.filePath,
      primaryModelPath,
      manifest.heroDisplay ?? null,
    )
      .then((parts) => {
        if (!cancelled) setPaintParts(parts);
      })
      .catch((err) => {
        logger.withError(err).error("[Foundry] Failed to list paint parts");
        if (!cancelled) setPaintParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [manifest, primaryModelPath]);

  const togglePaintPart = useCallback((texture: string, additive: boolean) => {
    setPaintSelection((current) => {
      if (!additive) {
        const alone =
          current.kind === "parts" &&
          current.textures.length === 1 &&
          current.textures[0] === texture;
        return { kind: "parts", textures: alone ? [] : [texture] };
      }
      const textures = current.kind === "parts" ? current.textures : [];
      const next = textures.includes(texture)
        ? textures.filter((entry) => entry !== texture)
        : [...textures, texture];
      return { kind: "parts", textures: next };
    });
  }, []);

  const toggleHiddenPart = useCallback((texture: string) => {
    setHiddenParts((current) =>
      current.includes(texture)
        ? current.filter((entry) => entry !== texture)
        : [...current, texture],
    );
  }, []);

  const loadManifest = useCallback(
    async (
      load: () => Promise<FoundryManifest>,
      requireHeroSkin: boolean,
      origin: FoundrySkinOrigin,
    ) => {
      workspaceSessionRef.current += 1;
      resetWorkspacePreparation();
      clearCaches();
      setCardPreviews(IDLE_CARDS);
      setWorkspace(null);
      setEditedPaths(new Set());
      setSoundSettings(new Map());
      setRemovedParts({});
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
        setSkinOrigin(origin);
        const initialModel = getPrimaryModelPath(result);
        setPrimaryModelPath(initialModel);
        selectEntryPath(initialModel);
        setActiveTab("assets");
        setStatus("ready");
        openWorkspace(result);
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
    [clearCaches, openWorkspace, resetWorkspacePreparation, selectEntryPath],
  );

  const importVpk = useCallback(
    (path: string) =>
      loadManifest(() => analyzeFoundryVpk(path), true, {
        kind: "file",
        name: fileStem(path),
        author: null,
        imageUrl: null,
      }),
    [loadManifest],
  );

  const importMod = useCallback(
    (
      modId: string,
      installedVpks: string[],
      profileFolder: string | null,
      origin: FoundrySkinOrigin,
    ) =>
      loadManifest(
        async () => {
          const resolved = await resolveModVpk(
            modId,
            installedVpks,
            profileFolder,
          );
          return await analyzeFoundryVpk(resolved);
        },
        true,
        origin,
      ),
    [loadManifest],
  );

  const importDefaultHero = useCallback(
    (heroDisplay: string, imageUrl: string | null) =>
      loadManifest(() => analyzeDefaultFoundryHero(heroDisplay), false, {
        kind: "default",
        name: heroDisplay,
        author: null,
        imageUrl,
      }),
    [loadManifest],
  );

  const invalidateEntry = useCallback(
    (entryPath: string) => {
      if (!filePath) return;
      soundCacheRef.current.delete(`${filePath}\n${entryPath}`);
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
      setAppliedPaint((current) => {
        const { [partPaintKey(entryPath)]: _unpainted, ...rest } = current;
        return rest;
      });
      afterContentChange([entryPath]);
    },
    [invalidateEntry, afterContentChange],
  );

  const requireWorkspace = useCallback((): FoundryWorkspace => {
    if (!workspace) {
      throw new Error("The Foundry workspace is not ready yet.");
    }
    return workspace;
  }, [workspace]);

  const replace = useFoundryEdit(
    async ({
      entryPath,
      sourceFilePath,
    }: {
      entryPath: string;
      sourceFilePath: string;
    }) => {
      const active = requireWorkspace();
      await replaceFoundryFile(
        active.root,
        entryPath,
        sourceFilePath,
        filePath,
      );
      if (entryPath.endsWith(".vsnd_c")) {
        setSoundSettings((current) =>
          new Map(current).set(entryPath, {
            ...(current.get(entryPath) ?? {
              entryPath,
              ...NO_SOUND_ADJUST,
            }),
            replaced: true,
          }),
        );
      }
      afterEdit(entryPath, true);
    },
  );
  const replaceEntry = useCallback(
    (entryPath: string, sourceFilePath: string) =>
      replace({ entryPath, sourceFilePath }),
    [replace],
  );

  const paintWholeTarget = useFoundryEdit(
    async ({
      target,
      paint,
    }: {
      target: FoundryPaintTargetId;
      paint: FoundryPaint;
    }) => {
      const active = requireWorkspace();
      if (!filePath) {
        throw new Error("No skin is loaded.");
      }
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
      setAppliedPaint((current) => ({
        ...withPaintedSections(current, result.paintedPaths, paint, paintParts),
        [targetPaintKey(target)]: paint,
      }));
      texturePreviewCacheRef.current.clear();
      afterContentChange(result.paintedPaths);
      return result;
    },
  );
  const paintTarget = useCallback(
    (target: FoundryPaintTargetId, paint: FoundryPaint) =>
      paintWholeTarget({ target, paint }),
    [paintWholeTarget],
  );

  const paintSections = useFoundryEdit(
    async ({
      textures,
      paint,
    }: {
      textures: string[];
      paint: FoundryPaint;
    }) => {
      const active = requireWorkspace();
      if (!filePath || !primaryModelPath) {
        throw new Error("No model is loaded.");
      }
      const result = await paintFoundryParts(
        active.root,
        filePath,
        primaryModelPath,
        manifest?.heroDisplay ?? null,
        textures,
        paint,
      );
      setEditedPaths((current) => {
        const next = new Set(current);
        for (const path of result.paintedPaths) next.add(path);
        return next;
      });
      setAppliedPaint((current) =>
        withPaintedSections(current, result.paintedPaths, paint, paintParts),
      );
      texturePreviewCacheRef.current.clear();
      afterContentChange(result.paintedPaths);
      return result;
    },
  );
  const paintSelectedParts = useCallback(
    (textures: string[], paint: FoundryPaint) =>
      paintSections({ textures, paint }),
    [paintSections],
  );

  const updateRemovedParts = useFoundryEdit(
    async ({
      modelPath,
      textures,
    }: {
      modelPath: string;
      textures: string[];
    }) => {
      const active = requireWorkspace();
      if (!filePath) {
        throw new RuntimeError("No model is loaded.");
      }
      const previous = removedParts[modelPath];
      const removed = await removeFoundryParts(
        active.root,
        filePath,
        modelPath,
        manifest?.heroDisplay ?? null,
        textures,
      );
      setEditedPaths((current) => {
        const next = new Set(current);
        for (const path of previous?.resources ?? []) next.delete(path);
        for (const path of removed.resources) next.add(path);
        return next;
      });
      setRemovedParts(({ [modelPath]: _previous, ...rest }) =>
        removed.textures.length > 0 ? { ...rest, [modelPath]: removed } : rest,
      );
      const restored = (previous?.textures ?? []).some(
        (texture) => !removed.textures.includes(texture),
      );
      if (restored) {
        afterContentChange([
          ...(previous?.resources ?? []),
          ...removed.resources,
        ]);
      } else {
        setEditRevision((revision) => revision + 1);
      }
    },
  );

  const toggleRemovedPart = useCallback(
    async (texture: string) => {
      if (!primaryModelPath) {
        throw new RuntimeError("No model is loaded.");
      }
      const current = removedParts[primaryModelPath]?.textures ?? [];
      await updateRemovedParts({
        modelPath: primaryModelPath,
        textures: current.includes(texture)
          ? current.filter((entry) => entry !== texture)
          : [...current, texture],
      });
    },
    [primaryModelPath, removedParts, updateRemovedParts],
  );

  const revert = useFoundryEdit(async (entryPath: string) => {
    const active = requireWorkspace();
    await revertFoundryFile(active.root, entryPath, filePath);
    setSoundSettings((current) => {
      const next = new Map(current);
      next.delete(entryPath);
      return next;
    });
    afterEdit(entryPath, false);
  });
  const revertEntry = useCallback(
    async (entryPath: string) => {
      const owner = Object.values(removedParts).find((removed) =>
        removed.resources.includes(entryPath),
      );
      if (owner) {
        await updateRemovedParts({ modelPath: owner.modelPath, textures: [] });
        return;
      }
      await revert(entryPath);
    },
    [removedParts, revert, updateRemovedParts],
  );

  const adjust = useFoundryEdit(
    async ({
      entryPath,
      settings,
    }: {
      entryPath: string;
      settings: FoundrySoundAdjust;
    }) => {
      const active = requireWorkspace();
      const adjusted = await adjustFoundrySound(
        active.root,
        entryPath,
        filePath,
        settings,
      );
      const kept = adjusted.replaced || !isNoSoundAdjust(adjusted);
      setSoundSettings((current) => {
        const next = new Map(current);
        if (kept) {
          next.set(entryPath, adjusted);
        } else {
          next.delete(entryPath);
        }
        return next;
      });
      afterEdit(entryPath, kept);
    },
  );
  const adjustSound = useCallback(
    (entryPath: string, settings: FoundrySoundAdjust) =>
      adjust({ entryPath, settings }),
    [adjust],
  );

  const playSound = useCallback(
    async (entryPath: string, original = false) => {
      if (!filePath) {
        throw new Error("No skin is loaded.");
      }
      const cacheKey = `${filePath}\n${entryPath}${original ? "\noriginal" : ""}`;
      const cached = soundCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const preview = await decodeFoundrySound(
        filePath,
        entryPath,
        original ? null : workspaceRoot,
      );
      soundCacheRef.current.set(cacheKey, preview.dataUrl);
      return preview.dataUrl;
    },
    [filePath, workspaceRoot],
  );

  const exportVpk = useFoundryEdit(async (request: FoundryExportRequest) => {
    const active = requireWorkspace();
    const attempt = analytics.start("foundry_export", {
      edited_asset_count: editedPaths.size,
    });
    try {
      const result = await exportFoundryWorkspace(active.root, {
        ...request,
        name: request.name ?? manifest?.heroDisplay ?? manifest?.hero ?? null,
        sourcePath: request.sourcePath ?? manifest?.sourcePath ?? null,
      });
      attempt.finish("completed");
      return result;
    } catch (error) {
      attempt.finish("failed");
      throw error;
    }
  });

  const highlightTextures = useMemo(
    () =>
      activeTab === "paint"
        ? selectionTextures(paintSelection, paintParts)
        : [],
    [activeTab, paintSelection, paintParts],
  );

  const value = useMemo<FoundryContextValue>(
    () => ({
      status,
      manifest,
      skinOrigin,
      workspace,
      workspacePreparationFailed,
      retryWorkspacePreparation,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      editRevision,
      textureRefresh,
      viewerReady,
      setViewerReady,
      registerHeroCapture,
      captureHero,
      soundSettings,
      primaryModelPath,
      setPrimaryModelPath,
      previewTint: activeTab === "paint" ? previewTint : null,
      setPreviewTint,
      paintTargets,
      appliedPaint,
      paintParts,
      paintSelection,
      setPaintSelection,
      togglePaintPart,
      highlightTextures,
      hiddenParts,
      toggleHiddenPart,
      removedParts,
      toggleRemovedPart,
      busy,
      setActiveTab,
      setSelectedEntryPath: selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
      replaceEntry,
      paintTarget,
      paintSelectedParts,
      revertEntry,
      adjustSound,
      playSound,
      exportVpk,
      reset,
    }),
    [
      status,
      manifest,
      skinOrigin,
      workspace,
      workspacePreparationFailed,
      retryWorkspacePreparation,
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      editRevision,
      textureRefresh,
      viewerReady,
      soundSettings,
      primaryModelPath,
      previewTint,
      paintTargets,
      appliedPaint,
      paintParts,
      paintSelection,
      togglePaintPart,
      highlightTextures,
      hiddenParts,
      toggleHiddenPart,
      removedParts,
      toggleRemovedPart,
      busy,
      selectEntryPath,
      previewCard,
      importVpk,
      importMod,
      importDefaultHero,
      replaceEntry,
      paintTarget,
      paintSelectedParts,
      revertEntry,
      adjustSound,
      playSound,
      exportVpk,
      reset,
    ],
  );

  return (
    <FoundryContext.Provider value={value}>{children}</FoundryContext.Provider>
  );
};

export const useOptionalFoundry = (): FoundryContextValue | null =>
  useContext(FoundryContext);

export const useFoundry = (): FoundryContextValue => {
  const ctx = useContext(FoundryContext);
  if (!ctx) {
    throw new Error("useFoundry must be used within a FoundryProvider");
  }
  return ctx;
};
