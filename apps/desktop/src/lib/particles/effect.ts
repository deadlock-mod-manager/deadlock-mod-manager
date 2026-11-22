import * as THREE from "three";
import type {
  ViewerEffect,
  ViewerEffectContext,
} from "@/components/foundry/viewer-effects";
import type { PreviewParticleSystem } from "@/types/generated/PreviewParticleSystem";
import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import { type JsonObject, jsonObject } from "./json";
import {
  type CompiledSystem,
  MAX_PARTICLES,
  type ParticleDiagnostic,
} from "./types";
import {
  compileSystem,
  type DefinitionFile,
  particleSystemDiagnostics,
} from "./compiler";
import { ParticleHierarchy } from "./hierarchy";
import { spriteDrawable, ropeDrawable } from "./drawables";
import { modelDrawable } from "./model-drawable";
import { createControlPointMarkers } from "./control-point-markers";

const PREWARM_SECONDS = 1.5;
/** Source is Z-up; glTF is Y-up. This turns the former into the latter. */
const SOURCE_TO_GLTF = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

const MAX_SYSTEMS = 48;
const MAX_DEPTH = 6;
const MAX_TOTAL_PARTICLES = 4096;
const MAX_DRAWABLES = 96;
type ParticleEffectData = Pick<
  PreviewParticles,
  "systems" | "textures" | "attachments"
>;
type ParticleEffectContext = Pick<
  ViewerEffectContext,
  "scene" | "camera" | "model" | "sceneColor"
>;

/** Parse and bound all roots together; usable without a renderer for diagnostics. */
export const compileParticleEffects = (data: ParticleEffectData) => {
  const diagnostics: ParticleDiagnostic[] = [];
  let remaining = MAX_SYSTEMS;
  const parseDefinition = (
    system: PreviewParticleSystem,
    depth: number,
  ): DefinitionFile | null => {
    if (remaining === 0 || depth > MAX_DEPTH) {
      diagnostics.push({
        path: system.path,
        stage: "definition",
        className: "",
        code: "system-limit",
      });
      return null;
    }
    remaining -= 1;
    let definition: JsonObject | undefined;
    try {
      definition = jsonObject.safeParse(JSON.parse(system.definition)).data;
    } catch {
      definition = undefined;
    }
    if (!definition) {
      diagnostics.push({
        path: system.path,
        stage: "definition",
        className: "",
        code: "invalid-definition",
      });
      return null;
    }
    return {
      path: system.path,
      definition,
      children: system.children
        .map((child) => parseDefinition(child, depth + 1))
        .filter((child): child is DefinitionFile => child !== null),
    };
  };
  const roots = data.systems
    .map((system) => parseDefinition(system, 0))
    .filter((file): file is DefinitionFile => file !== null)
    .map(compileSystem);
  let remainingParticles = MAX_TOTAL_PARTICLES;
  let remainingDrawables = MAX_DRAWABLES;
  for (const system of roots.flatMap(flatten)) {
    if (system.blockedBy) continue;
    const requested =
      system.emitters.length > 0
        ? Math.min(system.maxParticles, MAX_PARTICLES)
        : 0;
    system.maxParticles = Math.min(requested, remainingParticles);
    if (system.maxParticles < requested)
      diagnostics.push({
        path: system.path,
        stage: "definition",
        className: "",
        code: "system-limit",
        detail: "particle-budget",
      });
    remainingParticles -= system.maxParticles;
    if (system.maxParticles === 0 && requested > 0) {
      system.blockedBy = "particle-budget";
      continue;
    }
    if (system.renderers.length > remainingDrawables)
      diagnostics.push({
        path: system.path,
        stage: "renderer",
        className: "",
        code: "system-limit",
        detail: "drawable-budget",
      });
    system.renderers = system.renderers.slice(0, remainingDrawables);
    remainingDrawables -= system.renderers.length;
  }
  diagnostics.push(...particleSystemDiagnostics(roots));
  const textures = new Set(data.textures.map((texture) => texture.path));
  for (const texture of data.textures)
    if (
      texture.sequences.length > 128 ||
      texture.sequences.reduce(
        (count, sequence) => count + sequence.frames.length,
        0,
      ) > 4096
    )
      diagnostics.push({
        path: texture.path,
        stage: "renderer",
        className: "sprite-atlas",
        code: "system-limit",
        detail: "sprite-frame-budget",
      });
  for (const system of roots.flatMap(flatten)) {
    for (const renderer of system.renderers) {
      if (renderer.texture && !textures.has(renderer.texture))
        diagnostics.push({
          path: system.path,
          stage: "renderer",
          className: renderer.kind,
          code: "missing-texture",
          detail: renderer.texture,
        });
    }
  }
  return { roots, diagnostics };
};

/** Every system in a tree, so blocked parents still let children run. */
const flatten = (system: CompiledSystem): CompiledSystem[] => [
  system,
  ...system.children.flatMap(flatten),
];

export interface ParticlePreviewControls {
  charge: number;
  released: boolean;
  /** Recorded preview-clock time; preserves manual release when seeking. */
  releaseTime?: number;
  /** Target in model-local glTF coordinates; converted to the effect Source frame. */
  target: [number, number, number];
  markers: boolean;
  isolatedPath: string | null;
  /** Bindings are preview overrides, not an assertion about every authored effect. */
  targetControlPoint?: number;
  chargeControlPoint?: number;
  inputsEnabled?: boolean;
}

export interface ParticleEffectOptions {
  onDiagnostics?: (diagnostics: ParticleDiagnostic[]) => void;
  /**
   * Run the systems for a moment on every reset so ambient effects start in
   * full swing. Turn off for effects that should start with the animation,
   * like an ability's cast burst. Defaults to true.
   */
  prewarm?: boolean;
  /** Assets decoded once by the caller, outside simulation/render hot paths. */
  modelAssets?: ReadonlyMap<string, THREE.Object3D>;
  controls?: () => ParticlePreviewControls;
  autoReplay?: boolean;
}

const releaseTexture = (texture: THREE.Texture) => {
  texture.dispose();
  texture.source.data = null;
};

/** Unique bounded model dependencies, resolved before creating the effect. */
export const particleModelPaths = (data: ParticleEffectData): string[] =>
  [
    ...new Set(
      compileParticleEffects(data)
        .roots.flatMap(flatten)
        .flatMap((system) =>
          system.renderers.flatMap((renderer) => renderer.models),
        ),
    ),
  ].slice(0, 12);

/**
 * Plays the model's preview particle effects, bound to its attachment points.
 * Simulation runs in Source units and axes inside a group mapped onto the model.
 */
export const createParticleEffect =
  (data: ParticleEffectData, options: ParticleEffectOptions = {}) =>
  ({
    scene,
    camera,
    model,
    sceneColor,
  }: ParticleEffectContext): ViewerEffect | null => {
    const { roots, diagnostics } = compileParticleEffects(data);
    for (const root of roots.flatMap(flatten)) {
      let missingAttachment = false;
      for (const driver of root.drivers) {
        if (!driver.attachment) continue;
        const attachment = data.attachments.find(
          (point) => point.name === driver.attachment,
        );
        if (
          !attachment ||
          !model.getObjectByName(
            THREE.PropertyBinding.sanitizeNodeName(attachment.bone),
          )
        ) {
          missingAttachment = true;
          diagnostics.push({
            path: root.path,
            stage: "attachment",
            className: "",
            code: "missing-attachment",
            detail: driver.attachment,
          });
        }
      }
      if (missingAttachment) root.blockedBy = "missing-attachment";
    }
    if (roots.length === 0) return null;
    const fx = new THREE.Group();
    fx.matrixAutoUpdate = false;
    scene.add(fx);
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const textures = new Map<string, THREE.Texture>();
    const dataTextures = new Map<string, THREE.Texture>();
    const sequences = new Map(
      data.textures.map((texture) => [texture.path, texture.sequences]),
    );
    const usedTextures = new Set(
      roots
        .flatMap(flatten)
        .flatMap((system) =>
          system.blockedBy || system.maxParticles === 0
            ? []
            : system.renderers.flatMap((renderer) =>
                [
                  renderer.texture,
                  renderer.mask,
                  renderer.distortionTexture,
                ].filter((path): path is string => path !== null),
              ),
        ),
    );
    for (const texture of data.textures) {
      if (!usedTextures.has(texture.path) || textures.has(texture.path))
        continue;
      const map = loader.load(
        texture.dataUrl,
        (loaded) => {
          if (disposed) releaseTexture(loaded);
        },
        undefined,
        () => {
          if (disposed) return;
          diagnostics.push({
            path: texture.path,
            stage: "renderer",
            className: "",
            code: "missing-texture",
            detail: texture.path,
          });
          options.onDiagnostics?.([...diagnostics]);
        },
      );
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = false;
      textures.set(texture.path, map);
      sequences.set(texture.path, texture.sequences);
    }
    const dataTexture = (path: string | null) => {
      if (!path) return null;
      const cached = dataTextures.get(path);
      if (cached) return cached;
      const color = textures.get(path);
      if (!color) return null;
      const data = color.clone();
      data.colorSpace = THREE.NoColorSpace;
      dataTextures.set(path, data);
      return data;
    };
    const attachments = new Map(
      data.attachments.map((attachment) => [attachment.name, attachment]),
    );
    const trees = roots.map((root) => {
      const hierarchy = new ParticleHierarchy(root, {
        autoReplay:
          options.autoReplay ??
          (options.prewarm !== false && !options.controls),
      });
      const drawables = hierarchy.nodes.flatMap((node) => {
        const { system, spec } = node;
        return spec.blockedBy || spec.maxParticles === 0
          ? []
          : spec.renderers.map((renderer) => {
              const texture = renderer.texture
                ? (textures.get(renderer.texture) ?? null)
                : null;
              const mask = dataTexture(renderer.mask);
              const distortion = dataTexture(renderer.distortionTexture);
              const drawable =
                renderer.kind === "models"
                  ? modelDrawable(
                      system,
                      renderer,
                      options.modelAssets ?? new Map(),
                      fx,
                      (diagnostic) => diagnostics.push(diagnostic),
                    )
                  : renderer.kind === "ropes"
                    ? ropeDrawable(
                        system,
                        renderer,
                        texture,
                        mask,
                        fx,
                        sceneColor,
                        distortion,
                      )
                    : spriteDrawable(
                        system,
                        renderer,
                        texture,
                        mask,
                        renderer.texture
                          ? sequences.get(renderer.texture)
                          : undefined,
                        fx,
                        sceneColor,
                        distortion,
                      );
              if (renderer.refractive && !sceneColor)
                diagnostics.push({
                  path: spec.path,
                  stage: "renderer",
                  className: renderer.kind,
                  code: "approximation",
                  detail: "refraction-unavailable",
                });
              return { drawable, node, renderer };
            });
      });
      return { hierarchy, drawables };
    });
    options.onDiagnostics?.(diagnostics);
    let dirty = true;
    let previousControls: ParticlePreviewControls | undefined;
    let released = false;
    let previewElapsed = 0;
    const allNodes = trees.flatMap((tree) => tree.hierarchy.nodes);
    const drivenControlPoints = new Map(
      allNodes.map((node) => [
        node,
        new Set(node.spec.drivers.map((driver) => driver.controlPoint)),
      ]),
    );
    const markers = options.controls ? createControlPointMarkers(fx) : null;

    const attachmentMatrix = new THREE.Matrix4();
    const fxInverse = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const attachmentOffset = new THREE.Vector3();
    const attachmentRotation = new THREE.Quaternion();
    const driverOffset = new THREE.Vector3();
    const unitScale = new THREE.Vector3(1, 1, 1);

    const placeControlPoints = (snap: boolean) => {
      model.updateMatrixWorld(true);
      fx.matrix.multiplyMatrices(model.matrixWorld, SOURCE_TO_GLTF);
      fx.matrixWorld.copy(fx.matrix);
      fxInverse.copy(fx.matrixWorld).invert();
      for (const tree of trees) {
        tree.hierarchy.placeControlPoints((node) => {
          for (const driver of node.spec.drivers) {
            const point = node.controlPoints[driver.controlPoint];
            if (!point) continue;
            const attachment = driver.attachment
              ? attachments.get(driver.attachment)
              : undefined;
            const bone = attachment
              ? model.getObjectByName(
                  THREE.PropertyBinding.sanitizeNodeName(attachment.bone),
                )
              : undefined;
            if (!attachment || !bone) {
              point.position.fromArray(driver.offset);
              point.rotation.identity();
              continue;
            }
            attachmentMatrix
              .compose(
                attachmentOffset.fromArray(attachment.offset),
                attachmentRotation.fromArray(attachment.rotation),
                unitScale,
              )
              .premultiply(bone.matrixWorld)
              .premultiply(fxInverse)
              .decompose(point.position, point.rotation, scale);
            point.position.add(
              driverOffset
                .fromArray(driver.offset)
                .applyQuaternion(point.rotation),
            );
          }
          if (!node.parent) {
            const driven = drivenControlPoints.get(node);
            const anchor =
              node.controlPoints[node.spec.drivers[0]?.controlPoint ?? 0];
            for (let index = 0; index < node.controlPoints.length; index += 1) {
              const point = node.controlPoints[index];
              if (!anchor || index === 0 || driven?.has(index)) continue;
              point.position.copy(anchor.position);
              point.rotation.copy(anchor.rotation);
            }
          }
          const controls = options.controls?.();
          if (controls && controls.inputsEnabled !== false) {
            const target =
              node.controlPoints[controls.targetControlPoint ?? 10];
            if (target)
              target.position.set(
                controls.target[0],
                -controls.target[2],
                controls.target[1],
              );
            const charge = node.controlPoints[controls.chargeControlPoint ?? 1];
            if (charge)
              charge.position.x = THREE.MathUtils.clamp(controls.charge, 0, 1);
          }
        }, snap);
      }
    };

    const reset = () => {
      if (disposed) return;
      released = false;
      previewElapsed = 0;
      for (const tree of trees) tree.hierarchy.reset();
      placeControlPoints(true);
      const prewarmSeconds = options.prewarm === false ? 0 : PREWARM_SECONDS;
      for (let time = 0; time < prewarmSeconds; time += 1 / 30)
        for (const tree of trees) tree.hierarchy.update(1 / 30);
      dirty = true;
    };
    reset();

    return {
      reset,
      setVisible(visible) {
        fx.visible = visible;
      },
      release() {
        released = true;
        for (const tree of trees) tree.hierarchy.release();
        dirty = true;
      },
      update(delta) {
        if (disposed || !Number.isFinite(delta) || delta <= 0) return;
        const controls = options.controls?.();
        placeControlPoints(false);
        const step = Math.min(delta, 1 / 20);
        const releaseAt = controls?.released
          ? Math.max(controls.releaseTime ?? previewElapsed, 0)
          : null;
        const releaseWithinStep =
          releaseAt !== null && !released && releaseAt <= previewElapsed + step;
        const before = releaseWithinStep
          ? THREE.MathUtils.clamp(releaseAt - previewElapsed, 0, step)
          : step;
        if (before > 0) for (const tree of trees) tree.hierarchy.update(before);
        if (releaseWithinStep) {
          for (const tree of trees) tree.hierarchy.release();
          released = true;
          if (step > before)
            for (const tree of trees) tree.hierarchy.update(step - before);
        }
        previewElapsed += step;
        dirty = true;
      },
      prepare() {
        if (disposed) return;
        const controls = options.controls?.();
        if (controls) {
          if (controls !== previousControls) {
            previousControls = controls;
            placeControlPoints(true);
            dirty = true;
          }
          if (
            controls.released &&
            !released &&
            previewElapsed >= (controls.releaseTime ?? 0)
          ) {
            for (const tree of trees) tree.hierarchy.release();
            released = true;
            dirty = true;
          }
        }
        // Camera-facing expansion and atlas animation happen in shaders.
        // Only alpha ordering needs the camera when the simulation is paused.
        camera.updateMatrixWorld();
        model.updateWorldMatrix(true, false);
        fx.matrix.multiplyMatrices(model.matrixWorld, SOURCE_TO_GLTF);
        fx.updateMatrixWorld(true);
        for (const tree of trees)
          for (const { drawable, node, renderer } of tree.drawables) {
            const phaseVisible =
              renderer.phase === "any" ||
              (renderer.phase === "endcap") === node.system.ending;
            drawable.setVisible(
              phaseVisible &&
                (!controls?.isolatedPath ||
                  controls.isolatedPath === node.spec.path),
            );
            drawable.prepare(camera, dirty);
          }
        markers?.prepare(
          allNodes,
          controls?.markers ?? false,
          controls?.targetControlPoint ?? 10,
          controls?.isolatedPath ?? null,
        );
        dirty = false;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const tree of trees)
          for (const { drawable } of tree.drawables) drawable.dispose();
        markers?.dispose();
        for (const texture of dataTextures.values()) texture.dispose();
        dataTextures.clear();
        for (const texture of textures.values()) releaseTexture(texture);
        textures.clear();
        sequences.clear();
        fx.removeFromParent();
      },
    };
  };
