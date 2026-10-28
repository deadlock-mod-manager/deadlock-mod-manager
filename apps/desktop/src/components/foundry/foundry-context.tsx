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
  replaceFoundryFile,
  resolveModVpk,
  revertFoundryFile,
} from "@/lib/foundry";
import logger from "@/lib/logger";
import { releaseFoundryModel } from "@/lib/model-assets";
import type { FoundryPreviewTint } from "./foundry-model-viewer";
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
  FoundrySoundSettings,
  FoundryTab,
  FoundryWorkspace,
} from "@/types/foundry";
import { FOUNDRY_PATTERNS } from "@/types/foundry";

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

/** The targets whose textures are sections of the model. */
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

/** A picked file's name without its folder or extension. */
const fileStem = (path: string) =>
  path
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.vpk$/i, "") ?? path;

/** Where the open skin came from, for the workspace header. */
export interface FoundrySkinOrigin {
  kind: "mod" | "default" | "file";
  name: string;
  author: string | null;
  imageUrl: string | null;
}

/** The key `appliedPaint` keeps one target's or one section's paint under. */
export const targetPaintKey = (target: FoundryPaintTargetId) =>
  `target:${target}`;
export const partPaintKey = (texture: string) => `part:${texture}`;

/**
 * The color maps a selection covers on the model, for the viewer to tint and
 * highlight. Targets are resolved through the model's own section list, so a
 * preview colors exactly what an apply would rewrite. Ability effects are not
 * part of the model, so they cover nothing here.
 */
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

/**
 * Record a paint on the sections it reached. A target holding one of them no
 * longer wears a single paint, so its own entry is dropped; the caller sets
 * the target it painted afterwards.
 */
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
  error: string | null;
  activeTab: FoundryTab;
  selectedEntryPath: string | null;
  texturePreview: TexturePreview;
  modelPreview: ModelPreview;
  cardPreviews: CardPreviews;
  selectedCardKey: string | null;
  /** Entry paths the user has edited in this session. */
  editedPaths: ReadonlySet<string>;
  /** Bumped by every edit, so derived previews know to re-read. */
  editRevision: number;
  /** Volume edits and replacements, keyed by sound entry path. */
  soundSettings: ReadonlyMap<string, FoundrySoundSettings>;
  /** The model the preview defaults to and an export is named after. */
  primaryModelPath: string | null;
  setPrimaryModelPath: (path: string) => void;
  /** A scene-only tint for the paint tab's live preview; never written to disk. */
  previewTint: FoundryPreviewTint | null;
  setPreviewTint: (tint: FoundryPreviewTint | null) => void;
  /** How much of the hero each paint target covers, once the skin is scanned. */
  paintTargets: FoundryPaintTargetInfo[];
  /** The paint applied this session, keyed by `targetPaintKey` / `partPaintKey`. */
  appliedPaint: Readonly<Record<string, FoundryPaint>>;
  /** The primary model's paintable sections, in draw order. */
  paintParts: FoundryPaintPart[];
  /** What the paint tab is about to paint. */
  paintSelection: FoundryPaintSelection;
  setPaintSelection: (selection: FoundryPaintSelection) => void;
  /** Select one section, or add it to / take it out of a hand-picked set. */
  togglePaintPart: (texture: string, additive: boolean) => void;
  /** The selection's color maps while the paint tab is open, else none. */
  highlightTextures: readonly string[];
  /** Sections hidden in the paint tab's preview, so what is behind shows. */
  hiddenParts: readonly string[];
  toggleHiddenPart: (texture: string) => void;
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
  /** Set a sound's in-game volume, normalize and mute. */
  adjustSound: (entryPath: string, adjust: FoundrySoundAdjust) => Promise<void>;
  /** A playable data URL for a clip; `original` skips the workspace's edits. */
  playSound: (entryPath: string, original?: boolean) => Promise<string>;
  exportVpk: (request: FoundryExportRequest) => Promise<FoundryExportResult>;
  reset: () => void;
}

const FoundryContext = createContext<FoundryContextValue | null>(null);

const isTextureEntry = (path: string | null): path is string =>
  path?.endsWith(".vtex_c") ?? false;

const isModelEntry = (path: string | null): path is string =>
  path?.endsWith(".vmesh_c") || path?.endsWith(".vmdl_c") || false;

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
  const [skinOrigin, setSkinOrigin] = useState<FoundrySkinOrigin | null>(null);
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
  const [soundSettings, setSoundSettings] = useState<
    Map<string, FoundrySoundSettings>
  >(new Map());
  const [primaryModelPath, setPrimaryModelPath] = useState<string | null>(null);
  const [previewTint, setPreviewTint] = useState<FoundryPreviewTint | null>(
    null,
  );
  const [paintTargets, setPaintTargets] = useState<FoundryPaintTargetInfo[]>(
    [],
  );
  const [appliedPaint, setAppliedPaint] = useState<
    Record<string, FoundryPaint>
  >({});
  const [paintParts, setPaintParts] = useState<FoundryPaintPart[]>([]);
  const [paintSelection, setPaintSelection] =
    useState<FoundryPaintSelection>(DEFAULT_SELECTION);
  const [busy, setBusy] = useState(false);
  const [hiddenParts, setHiddenParts] = useState<string[]>([]);
  // Bumped by every edit. Each derived preview keys its cache on it, so one
  // counter keeps the model, the textures and the card gallery in step; three
  // separate ones let them drift apart.
  const [editRevision, setEditRevision] = useState(0);
  const texturePreviewCacheRef = useRef<Map<string, TexturePreview>>(new Map());
  const soundCacheRef = useRef<Map<string, string>>(new Map());

  const clearCaches = useCallback(() => {
    texturePreviewCacheRef.current.clear();
    soundCacheRef.current.clear();
  }, []);

  const reset = useCallback(() => {
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
  }, [filePath, workspaceRoot, previewModelPath, editRevision]);

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

  // The sections follow the primary model: they are what the paint tab's
  // preview shows and what a click on it selects.
  useEffect(() => {
    // A selection of another model's sections means nothing on this one.
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
      const prepared = await prepareFoundryWorkspace(
        loaded.filePath,
        name,
        entries,
      );
      // A reused workspace keeps edits from earlier sessions; its journal says
      // which, so export and undo see them too.
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
      setWorkspace(prepared);
    } catch (err) {
      logger.withError(err).error("[Foundry] Failed to prepare workspace");
      setWorkspace(null);
    }
  }, []);

  const loadManifest = useCallback(
    async (
      load: () => Promise<FoundryManifest>,
      requireHeroSkin: boolean,
      origin: FoundrySkinOrigin,
    ) => {
      clearCaches();
      setCardPreviews(IDLE_CARDS);
      setWorkspace(null);
      setEditedPaths(new Set());
      setSoundSettings(new Map());
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

  /** Drop every cached decode of one entry so the next read sees the edit. */
  const invalidateEntry = useCallback(
    (entryPath: string) => {
      if (!filePath) return;
      const cacheKey = `${filePath}\n${entryPath}`;
      texturePreviewCacheRef.current.delete(cacheKey);
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
      // A reverted or replaced section no longer wears its paint.
      setAppliedPaint((current) => {
        const { [partPaintKey(entryPath)]: _unpainted, ...rest } = current;
        return rest;
      });
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
        setAppliedPaint((current) => ({
          ...withPaintedSections(
            current,
            result.paintedPaths,
            paint,
            paintParts,
          ),
          [targetPaintKey(target)]: paint,
        }));
        // A repaint changes what the model samples and what the cards show.
        texturePreviewCacheRef.current.clear();
        setEditRevision((revision) => revision + 1);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [filePath, manifest, paintParts, requireWorkspace],
  );

  const paintSelectedParts = useCallback(
    async (textures: string[], paint: FoundryPaint) => {
      const active = requireWorkspace();
      if (!filePath || !primaryModelPath) {
        throw new Error("No model is loaded.");
      }
      setBusy(true);
      try {
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
        setEditRevision((revision) => revision + 1);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [filePath, manifest, paintParts, primaryModelPath, requireWorkspace],
  );

  const revertEntry = useCallback(
    async (entryPath: string) => {
      const active = requireWorkspace();
      setBusy(true);
      try {
        await revertFoundryFile(active.root, entryPath, filePath);
        setSoundSettings((current) => {
          const next = new Map(current);
          next.delete(entryPath);
          return next;
        });
        afterEdit(entryPath, false);
      } finally {
        setBusy(false);
      }
    },
    [afterEdit, filePath, requireWorkspace],
  );

  const adjustSound = useCallback(
    async (entryPath: string, adjust: FoundrySoundAdjust) => {
      const active = requireWorkspace();
      setBusy(true);
      try {
        const settings = await adjustFoundrySound(
          active.root,
          entryPath,
          filePath,
          adjust,
        );
        const kept = settings.replaced || !isNoSoundAdjust(settings);
        setSoundSettings((current) => {
          const next = new Map(current);
          if (kept) {
            next.set(entryPath, settings);
          } else {
            next.delete(entryPath);
          }
          return next;
        });
        afterEdit(entryPath, kept);
      } finally {
        setBusy(false);
      }
    },
    [afterEdit, filePath, requireWorkspace],
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

  const exportVpk = useCallback(
    async (request: FoundryExportRequest) => {
      const active = requireWorkspace();
      const attempt = analytics.start("foundry_export", {
        edited_asset_count: editedPaths.size,
      });
      setBusy(true);
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
      } finally {
        setBusy(false);
      }
    },
    [editedPaths.size, manifest, requireWorkspace],
  );

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
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      editRevision,
      soundSettings,
      primaryModelPath,
      setPrimaryModelPath,
      // Scoped to the paint tab at the source. The tab panels are all mounted
      // at once (the inactive ones are only hidden with CSS), so the paint
      // panel's effects run even while the user is looking at the asset
      // browser. Gating the tint here means no panel can colour a preview
      // outside the tab that owns the control.
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
      error,
      activeTab,
      selectedEntryPath,
      texturePreview,
      modelPreview,
      cardPreviews,
      selectedCardKey,
      editedPaths,
      editRevision,
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

/** The Foundry's state when rendered inside it, else null. */
export const useOptionalFoundry = (): FoundryContextValue | null =>
  useContext(FoundryContext);

export const useFoundry = (): FoundryContextValue => {
  const ctx = useContext(FoundryContext);
  if (!ctx) {
    throw new Error("useFoundry must be used within a FoundryProvider");
  }
  return ctx;
};
