import * as THREE from "three";
import type {
  ViewerEffect,
  ViewerEffectContext,
} from "@/components/foundry/viewer-effects";
import type { PreviewParticleSystem } from "@/types/generated/PreviewParticleSystem";
import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import type { PreviewSpriteSequence } from "@/types/generated/PreviewSpriteSequence";
import { type JsonObject, jsonObject } from "./json";
import {
  type CompiledSystem,
  type ControlPoint,
  FIELD,
  MAX_PARTICLES,
  type ParticleDiagnostic,
  type SpriteRendererSpec,
} from "./types";
import {
  compileSystem,
  type DefinitionFile,
  particleSystemDiagnostics,
} from "./compiler";
import { PATH_PROGRESS } from "./path";
import { ParticleSystem } from "./system";

const CONTROL_POINTS = 16;
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
  "scene" | "camera" | "model"
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

export interface ParticleEffectOptions {
  onDiagnostics?: (diagnostics: ParticleDiagnostic[]) => void;
  /**
   * Run the systems for a moment on every reset so ambient effects start in
   * full swing. Turn off for effects that should start with the animation,
   * like an ability's cast burst. Defaults to true.
   */
  prewarm?: boolean;
}

const SPRITE_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 iPosition;
attribute vec4 iColor;
attribute vec4 iUv;
attribute vec2 iSizeRoll;
varying vec2 vUv;
varying vec2 vMaskUv;
varying vec4 vColor;
void main() {
  vec4 view = modelViewMatrix * vec4(iPosition, 1.0);
  float c = cos(iSizeRoll.y);
  float s = sin(iSizeRoll.y);
  view.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iSizeRoll.x;
  gl_Position = projectionMatrix * view;
  vec2 t = corner * 0.5 + 0.5;
  vUv = vec2(mix(iUv.x, iUv.z, t.x), mix(iUv.w, iUv.y, t.y));
  vMaskUv = t;
  vColor = iColor;
}`;

const ROPE_VERTEX = /* glsl */ `
attribute vec4 tint;
varying vec2 vUv;
varying vec2 vMaskUv;
varying vec4 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vUv = uv;
  vMaskUv = uv;
  vColor = tint;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
uniform sampler2D mask;
uniform float hasMask;
varying vec2 vUv;
varying vec2 vMaskUv;
varying vec4 vColor;
void main() {
  vec4 texel = hasMap > 0.5
    ? texture2D(map, vUv)
    : vec4(1.0, 1.0, 1.0, (1.0 - smoothstep(0.0, 1.0, length(vUv * 2.0 - 1.0))));
  if (hasMask > 0.5) texel *= texture2D(mask, vMaskUv);
  gl_FragColor = vec4(texel.rgb * vColor.rgb, texel.a * vColor.a);
}`;

const makeMaterial = (
  vertexShader: string,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  additive: boolean,
) =>
  new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: FRAGMENT,
    uniforms: {
      map: { value: texture },
      hasMap: { value: texture ? 1 : 0 },
      mask: { value: mask },
      hasMask: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

const releaseTexture = (texture: THREE.Texture) => {
  texture.dispose();
  texture.source.data = null;
};

interface Drawable {
  update(camera: THREE.Vector3): void;
  dispose(): void;
}

const uvFor = (
  sequences: PreviewSpriteSequence[] | undefined,
  sequenceIndex: number,
  age: number,
  rate: number,
  out: Float32Array,
  offset: number,
) => {
  const sequence =
    sequences?.[Math.abs(Math.floor(sequenceIndex)) % (sequences.length || 1)];
  const frames = sequence?.frames;
  if (!sequence || !frames || frames.length === 0) {
    out.set([0, 0, 1, 1], offset);
    return;
  }
  const fps = sequence.framesPerSecond > 0 ? sequence.framesPerSecond : 10;
  const frame =
    frames[
      Math.floor(age * fps * Math.min(Math.max(rate * 10, 0.1), 10)) %
        frames.length
    ];
  out.set([frame.min[0], frame.min[1], frame.max[0], frame.max[1]], offset);
};

const spriteDrawable = (
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  sequences: PreviewSpriteSequence[] | undefined,
  parent: THREE.Object3D,
): Drawable => {
  const capacity = Math.min(
    Math.max(system.spec.maxParticles, 1),
    MAX_PARTICLES,
  );
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "corner",
    new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 4);
  const uvs = new Float32Array(capacity * 4);
  const sizeRoll = new Float32Array(capacity * 2);
  const attributes = {
    iPosition: new THREE.InstancedBufferAttribute(positions, 3),
    iColor: new THREE.InstancedBufferAttribute(colors, 4),
    iUv: new THREE.InstancedBufferAttribute(uvs, 4),
    iSizeRoll: new THREE.InstancedBufferAttribute(sizeRoll, 2),
  };
  for (const [name, attribute] of Object.entries(attributes)) {
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  const material = makeMaterial(SPRITE_VERTEX, texture, mask, spec.additive);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  parent.add(mesh);
  const tint: [number, number, number] = [1, 1, 1];
  return {
    update() {
      material.uniforms.hasMap.value = texture?.image ? 1 : 0;
      material.uniforms.hasMask.value = mask?.image ? 1 : 0;
      const count = Math.min(system.count, capacity);
      const position = system.vector(FIELD.position);
      const color = system.vector(FIELD.color);
      const radius = system.scalar(FIELD.radius);
      const roll = system.scalar(FIELD.roll);
      const alpha = system.scalar(FIELD.alpha);
      const alpha2 = system.scalar(spec.alpha2Field);
      const sequence = system.scalar(FIELD.sequence);
      for (let index = 0; index < count; index += 1) {
        const context = system.focus(index);
        spec.colorScale.evaluate(context, tint);
        const bright = spec.overbright.evaluate(context);
        positions.set(position.subarray(index * 3, index * 3 + 3), index * 3);
        colors[index * 4] = color[index * 3] * tint[0] * bright;
        colors[index * 4 + 1] = color[index * 3 + 1] * tint[1] * bright;
        colors[index * 4 + 2] = color[index * 3 + 2] * tint[2] * bright;
        colors[index * 4 + 3] = Math.min(
          Math.max(
            alpha[index] * alpha2[index] * spec.alphaScale.evaluate(context),
            0,
          ),
          1,
        );
        sizeRoll[index * 2] = Math.max(
          radius[index] * spec.radiusScale.evaluate(context),
          0,
        );
        sizeRoll[index * 2 + 1] = roll[index];
        uvFor(
          sequences,
          sequence[index],
          context.age,
          spec.animationRate,
          uvs,
          index * 4,
        );
      }
      geometry.instanceCount = count;
      for (const attribute of Object.values(attributes))
        attribute.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
};

const ropeDrawable = (
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  parent: THREE.Object3D,
): Drawable => {
  const capacity = Math.min(
    Math.max(system.spec.maxParticles, 2),
    MAX_PARTICLES,
  );
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 2 * 3);
  const tints = new Float32Array(capacity * 2 * 4);
  const uvs = new Float32Array(capacity * 2 * 2);
  const index: number[] = [];
  for (let segment = 0; segment < capacity - 1; segment += 1) {
    const a = segment * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  const position = new THREE.BufferAttribute(positions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const tint = new THREE.BufferAttribute(tints, 4).setUsage(
    THREE.DynamicDrawUsage,
  );
  const uv = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("tint", tint);
  geometry.setAttribute("uv", uv);
  const material = makeMaterial(ROPE_VERTEX, texture, mask, spec.additive);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  parent.add(mesh);
  const order: number[] = [];
  const point = new THREE.Vector3();
  const next = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const scale: [number, number, number] = [1, 1, 1];
  return {
    update(camera) {
      material.uniforms.hasMap.value = texture?.image ? 1 : 0;
      material.uniforms.hasMask.value = mask?.image ? 1 : 0;
      const count = Math.min(system.count, capacity);
      const created = system.scalar(FIELD.creationTime);
      const progress = system.scalar(PATH_PROGRESS);
      order.length = 0;
      for (let particle = 0; particle < count; particle += 1)
        order.push(particle);
      // A beam's particles spawn together; their place on the path orders them.
      order.sort(
        (a, b) => created[a] - created[b] || progress[a] - progress[b],
      );
      const source = system.vector(FIELD.position);
      const color = system.vector(FIELD.color);
      const radius = system.scalar(FIELD.radius);
      const alpha = system.scalar(FIELD.alpha);
      const alpha2 = system.scalar(spec.alpha2Field);
      let distance = 0;
      order.forEach((particle, slot) => {
        const context = system.focus(particle);
        point.fromArray(source, particle * 3);
        const neighbor = order[Math.min(slot + 1, count - 1)];
        const previous = order[Math.max(slot - 1, 0)];
        tangent
          .fromArray(source, neighbor * 3)
          .sub(next.fromArray(source, previous * 3));
        if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
        toCamera.subVectors(camera, point);
        side.crossVectors(tangent, toCamera).normalize();
        const width = Math.max(
          radius[particle] * spec.radiusScale.evaluate(context),
          0,
        );
        if (slot > 0)
          distance += point.distanceTo(next.fromArray(source, previous * 3));
        const v =
          distance / Math.max(spec.textureVWorldSize, 0.001) +
          system.age * spec.textureVScrollRate * 0.01;
        spec.colorScale.evaluate(context, scale);
        const bright = spec.overbright.evaluate(context);
        const opacity = Math.min(
          Math.max(
            alpha[particle] *
              alpha2[particle] *
              spec.alphaScale.evaluate(context),
            0,
          ),
          1,
        );
        for (let edge = 0; edge < 2; edge += 1) {
          const vertex = slot * 2 + edge;
          const sign = edge === 0 ? -1 : 1;
          positions[vertex * 3] = point.x + side.x * width * sign;
          positions[vertex * 3 + 1] = point.y + side.y * width * sign;
          positions[vertex * 3 + 2] = point.z + side.z * width * sign;
          uvs[vertex * 2] = edge;
          uvs[vertex * 2 + 1] = v;
          tints[vertex * 4] = color[particle * 3] * scale[0] * bright;
          tints[vertex * 4 + 1] = color[particle * 3 + 1] * scale[1] * bright;
          tints[vertex * 4 + 2] = color[particle * 3 + 2] * scale[2] * bright;
          tints[vertex * 4 + 3] = opacity;
        }
      });
      geometry.setDrawRange(0, Math.max(count - 1, 0) * 6);
      position.needsUpdate = true;
      tint.needsUpdate = true;
      uv.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
};

/**
 * Plays the model's preview particle effects, bound to its attachment points.
 * Simulation runs in Source units and axes inside a group mapped onto the model.
 */
export const createParticleEffect =
  (data: ParticleEffectData, options: ParticleEffectOptions = {}) =>
  ({ scene, camera, model }: ParticleEffectContext): ViewerEffect | null => {
    const { roots, diagnostics } = compileParticleEffects(data);
    for (const root of roots) {
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
      if (missingAttachment)
        for (const system of flatten(root))
          system.blockedBy = "missing-attachment";
    }
    options.onDiagnostics?.(diagnostics);
    if (roots.length === 0) return null;
    const fx = new THREE.Group();
    fx.matrixAutoUpdate = false;
    scene.add(fx);
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const textures = new Map<string, THREE.Texture>();
    const sequences = new Map<string, PreviewSpriteSequence[]>();
    const usedTextures = new Set(
      roots
        .flatMap(flatten)
        .flatMap((system) =>
          system.blockedBy || system.maxParticles === 0
            ? []
            : system.renderers.flatMap((renderer) =>
                [renderer.texture, renderer.mask].filter(
                  (path): path is string => path !== null,
                ),
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
    const attachments = new Map(
      data.attachments.map((attachment) => [attachment.name, attachment]),
    );
    const trees = roots.map((root) => {
      const controlPoints: ControlPoint[] = Array.from(
        { length: CONTROL_POINTS },
        () => ({
          position: new THREE.Vector3(),
          rotation: new THREE.Quaternion(),
          previousPosition: new THREE.Vector3(),
          previousRotation: new THREE.Quaternion(),
        }),
      );
      const specs = flatten(root);
      const preEmission = specs.flatMap((spec) =>
        spec.blockedBy === "missing-attachment" ? [] : spec.preEmission,
      );
      const systems = specs
        .filter((spec) => !spec.blockedBy && spec.maxParticles > 0)
        .map((spec) => new ParticleSystem(spec, controlPoints));
      const drawables = systems.flatMap((system) =>
        system.spec.renderers.map((spec) => {
          const texture = spec.texture
            ? (textures.get(spec.texture) ?? null)
            : null;
          const mask = spec.mask ? (textures.get(spec.mask) ?? null) : null;
          return spec.kind === "sprites"
            ? spriteDrawable(
                system,
                spec,
                texture,
                mask,
                spec.texture ? sequences.get(spec.texture) : undefined,
                fx,
              )
            : ropeDrawable(system, spec, texture, mask, fx);
        }),
      );
      const driven = new Set(root.drivers.map((driver) => driver.controlPoint));
      return { root, controlPoints, systems, drawables, preEmission, driven };
    });

    const attachmentMatrix = new THREE.Matrix4();
    const fxInverse = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const cameraLocal = new THREE.Vector3();
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
        for (const point of tree.controlPoints) {
          point.previousPosition.copy(point.position);
          point.previousRotation.copy(point.rotation);
        }
        for (const driver of tree.root.drivers) {
          const point = tree.controlPoints[driver.controlPoint];
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
            // Unattached drivers sit at the model's origin, plus the offset
            // the effect's author previewed it with (a beam's far end).
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
        // Control points nothing drives sit on the first driven one.
        const anchor =
          tree.controlPoints[tree.root.drivers[0]?.controlPoint ?? 0];
        tree.controlPoints.forEach((point, index) => {
          if (!anchor || index === 0 || tree.driven.has(index)) return;
          point.position.copy(anchor.position);
          point.rotation.copy(anchor.rotation);
        });
        for (const operator of tree.preEmission) operator(tree.controlPoints);
        if (snap) {
          for (const point of tree.controlPoints) {
            point.previousPosition.copy(point.position);
            point.previousRotation.copy(point.rotation);
          }
        }
      }
    };

    const reset = () => {
      if (disposed) return;
      placeControlPoints(true);
      for (const tree of trees)
        for (const system of tree.systems) system.reset();
      const prewarmSeconds = options.prewarm === false ? 0 : PREWARM_SECONDS;
      for (let time = 0; time < prewarmSeconds; time += 1 / 30) {
        for (const tree of trees)
          for (const system of tree.systems) system.update(1 / 30);
      }
    };
    reset();

    return {
      reset,
      update(delta) {
        if (disposed) return;
        placeControlPoints(false);
        const step = Number.isFinite(delta) ? Math.min(delta, 1 / 20) : 0;
        camera.getWorldPosition(cameraLocal).applyMatrix4(fxInverse);
        for (const tree of trees) {
          if (step > 0) for (const system of tree.systems) system.update(step);
          for (const drawable of tree.drawables) drawable.update(cameraLocal);
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const tree of trees)
          for (const drawable of tree.drawables) drawable.dispose();
        for (const texture of textures.values()) releaseTexture(texture);
        textures.clear();
        sequences.clear();
        fx.removeFromParent();
      },
    };
  };
