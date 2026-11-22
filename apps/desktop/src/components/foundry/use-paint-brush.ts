import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryPaint, FoundryPaintSelection } from "@/types/foundry";
import { selectionTextures, useFoundry } from "./foundry-context";
import {
  selectionKey,
  appliedFor,
  defaultPaint,
  coverage,
  isPendingColor,
  tintLayer,
} from "./foundry-paint-utils";

export const usePaintBrush = () => {
  const { t } = useTranslation();
  const {
    paintTargets,
    appliedPaint,
    workspace,
    busy,
    paintParts,
    paintSelection,
    paintTarget,
    paintSelectedParts,
    setPreviewTint,
  } = useFoundry();
  const [drafts, setDrafts] = useState<
    Record<string, { selection: FoundryPaintSelection; paint: FoundryPaint }>
  >({});
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [applying, setApplying] = useState(false);
  const [comparing, setComparing] = useState(false);

  const infoById = useMemo(
    () => new Map(paintTargets.map((info) => [info.id, info])),
    [paintTargets],
  );

  const key = selectionKey(paintSelection);
  const applied = appliedFor(paintSelection, appliedPaint, paintParts);
  const paint =
    drafts[key]?.paint ??
    applied ??
    defaultPaint(
      paintSelection.kind === "target" ? paintSelection.target : "body",
    );
  const info =
    paintSelection.kind === "target"
      ? infoById.get(paintSelection.target)
      : undefined;
  const nothingSelected =
    paintSelection.kind === "target"
      ? coverage(info) === 0
      : paintSelection.textures.length === 0;
  const disabled = !workspace || busy || nothingSelected;
  const tintTextures = useMemo(
    () => selectionTextures(paintSelection, paintParts),
    [paintSelection, paintParts],
  );

  const patterned = paint.pattern !== "none";
  const colorDrivesParticlesOnly = patterned && (info?.particleCount ?? 0) > 0;
  const colorIgnored = patterned && !colorDrivesParticlesOnly;

  const isDirty = isPendingColor(paint, applied);

  const previewBlocker = patterned
    ? ("pattern" as const)
    : tintTextures.length === 0
      ? ("noTextures" as const)
      : !isDirty
        ? ("applied" as const)
        : undefined;
  const canPreview = previewBlocker === undefined;
  const showTint = previewEnabled && canPreview;

  const tintLayers = useMemo(() => {
    const layers = Object.entries(drafts).flatMap(([draftKey, draft]) => {
      if (draftKey === key || draft.paint.pattern !== "none") return [];
      const draftApplied = appliedFor(
        draft.selection,
        appliedPaint,
        paintParts,
      );
      if (!isPendingColor(draft.paint, draftApplied)) return [];
      return [
        tintLayer(selectionTextures(draft.selection, paintParts), draft.paint),
      ];
    });
    if (canPreview) {
      const current = {
        textures: tintTextures,
        colorHex: paint.colorHex,
        saturation: paint.saturation,
        brightness: paint.brightness,
      };
      if (key in drafts) {
        layers.push(current);
      } else {
        layers.unshift(current);
      }
    }
    return layers.filter((layer) => layer.textures.length > 0);
  }, [
    drafts,
    key,
    appliedPaint,
    paintParts,
    canPreview,
    tintTextures,
    paint.colorHex,
    paint.saturation,
    paint.brightness,
  ]);
  const tinting = previewEnabled && tintLayers.length > 0;
  const pendingColors = useMemo(() => {
    const picked =
      canPreview && !(key in drafts) ? tintLayers.slice(1) : tintLayers;
    return new Map(
      picked.flatMap((layer) =>
        layer.textures.map((texture) => [texture, layer.colorHex] as const),
      ),
    );
  }, [tintLayers, canPreview, key, drafts]);

  useEffect(() => {
    setPreviewTint(tinting ? (comparing ? [] : tintLayers) : null);
    return () => setPreviewTint(null);
  }, [tinting, comparing, tintLayers, setPreviewTint]);

  useEffect(() => {
    if (!tinting) return;
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || typing(event)) return;
      event.preventDefault();
      setComparing(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setComparing(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setComparing(false);
    };
  }, [tinting]);

  const update = useCallback(
    (patch: Partial<FoundryPaint>) => {
      setDrafts((current) => ({
        ...current,
        [key]: { selection: paintSelection, paint: { ...paint, ...patch } },
      }));
    },
    [key, paint, paintSelection],
  );

  const resetDraft = useCallback(() => {
    setDrafts((current) => {
      const { [key]: _dropped, ...rest } = current;
      return rest;
    });
  }, [key]);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      if (paintSelection.kind === "target") {
        await paintTarget(paintSelection.target, paint);
      } else {
        const result = await paintSelectedParts(paintSelection.textures, paint);
        if (result.skippedPaths.length > 0) {
          toast.error(
            t("foundry.paint.partsSkipped", {
              count: result.skippedPaths.length,
            }),
          );
        }
      }
      const painted = new Set(tintTextures);
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([draftKey, draft]) =>
              draftKey !== key &&
              !selectionTextures(draft.selection, paintParts).some((texture) =>
                painted.has(texture),
              ),
          ),
        ),
      );
    } catch (err) {
      logger.withError(err).error("[Foundry] Paint failed");
      toast.error(t("foundry.paint.failed"));
    } finally {
      setApplying(false);
    }
  }, [
    key,
    paint,
    paintParts,
    paintSelectedParts,
    paintSelection,
    paintTarget,
    t,
    tintTextures,
  ]);

  return {
    paint,
    info,
    infoById,
    disabled,
    nothingSelected,
    patterned,
    colorDrivesParticlesOnly,
    colorIgnored,
    hasDraft: key in drafts,
    tintTextures,
    canPreview,
    previewBlocker,
    previewEnabled,
    setPreviewEnabled,
    showTint,
    tinting,
    pendingColors,
    applying,
    update,
    resetDraft,
    apply,
  };
};

export type PaintBrush = ReturnType<typeof usePaintBrush>;
