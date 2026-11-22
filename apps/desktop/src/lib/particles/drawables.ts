import * as THREE from "three";
import type { PreviewSpriteSequence } from "@/types/generated/PreviewSpriteSequence";
import type { ParticleSystem } from "./system";
import { FIELD, MAX_PARTICLES, type SpriteRendererSpec } from "./types";
import { PATH_PROGRESS } from "./path";
import type { SceneColorCapture, SceneColorUniforms } from "./scene-color";

export interface ParticleDrawable {
  prepare(camera: THREE.Camera, dirty: boolean): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const VARYINGS = /* glsl */ `
varying vec2 vUv;
varying vec2 vMaskUv;
varying vec4 vColor;
`;

const SPRITE_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 iPosition;
attribute vec4 iColor;
attribute vec4 iAnimation;
attribute vec2 iSizeRoll;
attribute vec4 iVelocityLength;
attribute vec4 iTailColor;
uniform float time;
uniform float animationRate;
uniform sampler2D frames;
uniform float frameCount;
uniform float trail;
uniform vec2 uvScale;
uniform vec2 uvOffset;
${VARYINGS}
void main() {
  vec4 view = modelViewMatrix * vec4(iPosition, 1.0);
  float c = cos(iSizeRoll.y);
  float s = sin(iSizeRoll.y);
  vec2 t = corner * 0.5 + 0.5;
  if (trail > 0.5) {
    vec2 velocity = (modelViewMatrix * vec4(iVelocityLength.xyz, 0.0)).xy;
    vec2 direction = length(velocity) > 0.0001 ? normalize(velocity) : vec2(0.0, 1.0);
    view.xy -= direction * (1.0 - t.y) * iVelocityLength.w;
    view.xy += vec2(-direction.y, direction.x) * corner.x * iSizeRoll.x;
  } else {
    view.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iSizeRoll.x;
  }
  gl_Position = projectionMatrix * view;
  vec4 uvBounds = vec4(0.0, 0.0, 1.0, 1.0);
  if (iAnimation.z > 0.5) {
    float phase = mod(max(time - iAnimation.x, 0.0) * animationRate, max(iAnimation.w, 0.0001));
    float lo = 0.0;
    float hi = iAnimation.z - 1.0;
    // Bounded binary search preserves variable authored frame durations.
    for (int iteration = 0; iteration < 12; iteration++) {
      if (lo >= hi) break;
      float mid = floor((lo + hi) * 0.5);
      float end = texture2D(frames, vec2((iAnimation.y + mid + 0.5) / frameCount, 0.75)).x;
      if (phase >= end) lo = min(mid + 1.0, hi); else hi = mid;
    }
    uvBounds = texture2D(frames, vec2((iAnimation.y + lo + 0.5) / frameCount, 0.25));
  }
  vMaskUv = t;
  vec2 transformed = t * uvScale + uvOffset;
  vUv = vec2(mix(uvBounds.x, uvBounds.z, transformed.x), mix(uvBounds.w, uvBounds.y, transformed.y));
  vColor = trail > 0.5 ? mix(iTailColor, iColor, t.y) : iColor;
}`;

const ROPE_VERTEX = /* glsl */ `
attribute vec3 tangent;
attribute vec4 tint;
attribute float halfWidth;
attribute float edge;
uniform vec2 uvScale;
uniform vec2 uvOffset;
uniform float time;
uniform float scroll;
${VARYINGS}
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vec2 direction = (modelViewMatrix * vec4(tangent, 0.0)).xy;
  direction = length(direction) > 0.0001 ? normalize(direction) : vec2(0.0, 1.0);
  view.xy += vec2(-direction.y, direction.x) * halfWidth * edge;
  gl_Position = projectionMatrix * view;
  vUv = uv * uvScale + uvOffset + vec2(0.0, time * scroll);
  vMaskUv = uv;
  vColor = tint;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
uniform sampler2D mask;
uniform float hasMask;
uniform float tailFade;
uniform float ribbon;
uniform float refractStrength;
uniform sampler2D distortionMap;
uniform float hasDistortion;
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform float hasSceneColor;
uniform vec2 screenSize;
${VARYINGS}
void main() {
  float fallbackDistance = ribbon > 0.5 ? abs(vMaskUv.x * 2.0 - 1.0) : length(vMaskUv * 2.0 - 1.0);
  vec4 texel = hasMap > 0.5 ? texture2D(map, vUv)
    : vec4(vec3(1.0), 1.0 - smoothstep(0.0, 1.0, fallbackDistance));
  if (hasMask > 0.5) texel *= texture2D(mask, vMaskUv);
  vec4 color = vec4(texel.rgb * vColor.rgb, texel.a * vColor.a);
  color.a *= mix(1.0, smoothstep(0.0, 0.3, vMaskUv.y), tailFade);
  if (hasSceneColor > 0.5 && refractStrength != 0.0) {
    vec2 screen = gl_FragCoord.xy / screenSize;
    vec2 distortion = hasDistortion > 0.5 ? texture2D(distortionMap, vUv).rg : texel.rg;
    vec2 offset = (distortion * 2.0 - 1.0) * refractStrength * texel.a;
    vec2 displaced = clamp(screen + offset, vec2(0.001), vec2(0.999));
    // Do not pull foreground geometry across an effect behind it.
    float sampledDepth = texture2D(sceneDepth, displaced).x;
    if (sampledDepth < gl_FragCoord.z - 0.0001) displaced = screen;
    color.rgb = texture2D(sceneColor, displaced).rgb * vColor.rgb;
  }
  gl_FragColor = color;
  // Linear HDR goes to the viewer composer. Its OutputPass performs the
  // only tone-map/output conversion; sRGB texture uploads decode in hardware.
}`;

const makeMaterial = (
  vertexShader: string,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  spec: SpriteRendererSpec,
  distortion: THREE.Texture | null,
) => {
  const sceneUniforms: SceneColorUniforms = {
    sceneColor: { value: null },
    sceneDepth: { value: null },
    hasSceneColor: { value: 0 },
    screenSize: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: FRAGMENT,
    uniforms: {
      ...sceneUniforms,
      map: { value: texture },
      hasMap: { value: 0 },
      mask: { value: mask },
      hasMask: { value: 0 },
      time: { value: 0 },
      trail: { value: spec.kind === "trails" ? 1 : 0 },
      ribbon: { value: spec.kind === "ropes" ? 1 : 0 },
      tailFade: { value: spec.kind === "trails" && spec.tailFade ? 1 : 0 },
      refractStrength: { value: 0 },
      distortionMap: { value: distortion },
      hasDistortion: { value: 0 },
      animationRate: {
        value: Math.min(Math.max(spec.animationRate * 10, 0.1), 10),
      },
      scroll: { value: spec.textureVScrollRate * 0.01 },
      uvScale: { value: new THREE.Vector2(...spec.uvScale) },
      uvOffset: { value: new THREE.Vector2(...spec.uvOffset) },
    },
    transparent: spec.blend !== "opaque",
    depthWrite: spec.blend === "opaque",
    blending:
      spec.blend === "add"
        ? THREE.AdditiveBlending
        : spec.blend === "multiply"
          ? THREE.MultiplyBlending
          : spec.blend === "opaque"
            ? THREE.NoBlending
            : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return { material, sceneUniforms };
};

const syncMaterial = (
  material: THREE.ShaderMaterial,
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
) => {
  material.uniforms.time.value = system.age;
  material.uniforms.hasMap.value = texture?.image ? 1 : 0;
  material.uniforms.hasMask.value = mask?.image ? 1 : 0;
  material.uniforms.hasDistortion.value = material.uniforms.distortionMap.value
    ?.image
    ? 1
    : 0;
  material.uniforms.refractStrength.value = Math.min(
    Math.max(spec.refractStrength.evaluate(system.focusCollection()), -0.15),
    0.15,
  );
};

/** Stable back-to-front ordering in camera space, without modifying simulation indices. */
export const particleDrawOrder = (
  count: number,
  positions: Float32Array,
  modelView: THREE.Matrix4,
  alphaBlend: boolean,
  out: number[],
) => {
  out.length = count;
  for (let index = 0; index < count; index += 1) out[index] = index;
  if (!alphaBlend) return out;
  const m = modelView.elements;
  const depth = (index: number) =>
    m[2] * positions[index * 3] +
    m[6] * positions[index * 3 + 1] +
    m[10] * positions[index * 3 + 2] +
    m[14];
  out.sort((a, b) => depth(a) - depth(b) || a - b);
  return out;
};

export const trailLength = (
  speed: number,
  age: number,
  scale: number,
  min: number,
  max: number,
  attribute = 0.1,
  fadeInTime = 0,
  ignoreDT = false,
) => {
  const fade =
    fadeInTime > 0 ? THREE.MathUtils.clamp(age / fadeInTime, 0, 1) : 1;
  const raw =
    speed *
    Math.max(attribute, 0) *
    Math.max(scale, 0) *
    fade *
    (ignoreDT ? 1 / 60 : 1);
  return THREE.MathUtils.clamp(raw, Math.max(min, 0), Math.max(min, max, 0));
};

const frameAtlas = (sequences: PreviewSpriteSequence[] | undefined) => {
  const bounded = (sequences ?? []).slice(0, 128);
  const count = Math.max(
    Math.min(
      bounded.reduce((sum, sequence) => sum + sequence.frames.length, 0),
      4096,
    ),
    1,
  );
  const data = new Float32Array(count * 8);
  const lookup: { start: number; count: number; duration: number }[] = [];
  let cursor = 0;
  for (const sequence of bounded) {
    const start = cursor;
    let duration = 0;
    for (const frame of sequence.frames) {
      if (cursor >= count) break;
      const seconds =
        frame.duration > 0
          ? frame.duration
          : 1 / (sequence.framesPerSecond > 0 ? sequence.framesPerSecond : 10);
      duration += seconds;
      data.set(
        [frame.min[0], frame.min[1], frame.max[0], frame.max[1]],
        cursor * 4,
      );
      data[(count + cursor) * 4] = duration;
      cursor += 1;
    }
    lookup.push({ start, count: cursor - start, duration });
  }
  const texture = new THREE.DataTexture(
    data,
    count,
    2,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;
  return { texture, lookup, count };
};

export const spriteDrawable = (
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  sequences: PreviewSpriteSequence[] | undefined,
  parent: THREE.Object3D,
  sceneColor?: SceneColorCapture,
  distortion: THREE.Texture | null = null,
): ParticleDrawable => {
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
  const animation = new Float32Array(capacity * 4);
  const sizeRoll = new Float32Array(capacity * 2);
  const velocityLength = new Float32Array(capacity * 4);
  const tailColors = new Float32Array(capacity * 4);
  const attributes = {
    iPosition: new THREE.InstancedBufferAttribute(positions, 3),
    iColor: new THREE.InstancedBufferAttribute(colors, 4),
    iAnimation: new THREE.InstancedBufferAttribute(animation, 4),
    iSizeRoll: new THREE.InstancedBufferAttribute(sizeRoll, 2),
    iVelocityLength: new THREE.InstancedBufferAttribute(velocityLength, 4),
    iTailColor: new THREE.InstancedBufferAttribute(tailColors, 4),
  };
  for (const [name, attribute] of Object.entries(attributes))
    geometry.setAttribute(name, attribute.setUsage(THREE.DynamicDrawUsage));
  const { material, sceneUniforms } = makeMaterial(
    SPRITE_VERTEX,
    texture,
    mask,
    spec,
    distortion,
  );
  const atlas = frameAtlas(sequences);
  material.uniforms.frames = { value: atlas.texture };
  material.uniforms.frameCount = { value: atlas.count };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  parent.add(mesh);
  const unregister = spec.refractive
    ? sceneColor?.register(mesh, sceneUniforms)
    : undefined;
  const tint: [number, number, number] = [1, 1, 1];
  const tailTint: [number, number, number] = [1, 1, 1];
  const order: number[] = [];
  const modelView = new THREE.Matrix4();
  const previousView = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    setVisible(visible) {
      mesh.visible = visible;
    },
    prepare(camera, dirty) {
      syncMaterial(material, system, spec, texture, mask);
      modelView.multiplyMatrices(camera.matrixWorldInverse, parent.matrixWorld);
      const sorted = spec.blend === "alpha" || spec.blend === "multiply";
      if (!dirty && (!sorted || previousView.equals(modelView))) return;
      previousView.copy(modelView);
      const count = Math.min(system.count, capacity);
      const position = system.vector(FIELD.position);
      particleDrawOrder(count, position, modelView, sorted, order);
      const color = system.vector(FIELD.color);
      const radius = system.scalar(FIELD.radius);
      const roll = system.scalar(FIELD.roll);
      const alpha = system.scalar(FIELD.alpha);
      const alpha2 = system.scalar(spec.alpha2Field);
      const sequence = system.scalar(FIELD.sequence);
      const created = system.scalar(FIELD.creationTime);
      const trailAttribute = system.scalar(FIELD.trailLength);
      for (let slot = 0; slot < count; slot += 1) {
        const index = order[slot];
        const context = system.focus(index);
        spec.colorScale.evaluate(context, tint);
        const bright = spec.overbright.evaluate(context);
        for (let component = 0; component < 3; component += 1) {
          positions[slot * 3 + component] = position[index * 3 + component];
          colors[slot * 4 + component] =
            color[index * 3 + component] * tint[component] * bright;
          velocityLength[slot * 4 + component] =
            system.velocity[index * 3 + component];
        }
        colors[slot * 4 + 3] = Math.min(
          Math.max(
            alpha[index] * alpha2[index] * spec.alphaScale.evaluate(context),
            0,
          ),
          1,
        );
        sizeRoll[slot * 2] = Math.max(
          radius[index] * spec.radiusScale.evaluate(context),
          0,
        );
        sizeRoll[slot * 2 + 1] = roll[index];
        if (spec.kind === "trails") {
          const speed = Math.hypot(
            system.velocity[index * 3],
            system.velocity[index * 3 + 1],
            system.velocity[index * 3 + 2],
          );
          velocityLength[slot * 4 + 3] = trailLength(
            speed,
            context.age,
            spec.lengthScale.evaluate(context),
            spec.minLength.evaluate(context),
            spec.maxLength.evaluate(context),
            trailAttribute[index],
            spec.lengthFadeInTime.evaluate(context),
            spec.ignoreDT,
          );
          sizeRoll[slot * 2] = Math.min(
            sizeRoll[slot * 2],
            Math.max(spec.constrainRadiusToLengthRatio.evaluate(context), 0) *
              velocityLength[slot * 4 + 3],
          );
          spec.tailColorScale.evaluate(context, tailTint);
          for (let component = 0; component < 3; component += 1)
            tailColors[slot * 4 + component] =
              colors[slot * 4 + component] * tailTint[component];
          tailColors[slot * 4 + 3] =
            colors[slot * 4 + 3] * spec.tailAlphaScale.evaluate(context);
        }
        const frames =
          atlas.lookup[
            Math.abs(Math.floor(sequence[index])) % (atlas.lookup.length || 1)
          ];
        animation[slot * 4] = created[index];
        animation[slot * 4 + 1] = frames?.start ?? 0;
        animation[slot * 4 + 2] = frames?.count ?? 0;
        animation[slot * 4 + 3] = frames?.duration ?? 1;
      }
      geometry.instanceCount = count;
      for (const attribute of Object.values(attributes)) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      unregister?.();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      atlas.texture.dispose();
    },
  };
};

/** Catmull-Rom interpolation with endpoint clamping, bounded by renderer subdivisions. */
export const curvePoint = (
  a: number,
  b: number,
  c: number,
  d: number,
  t: number,
) =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);

const repeatTexture = (source: THREE.Texture | null) => {
  if (!source) return null;
  const copy = source.clone();
  copy.wrapT = THREE.RepeatWrapping;
  copy.needsUpdate = true;
  return copy;
};

export const ropeDrawable = (
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  texture: THREE.Texture | null,
  mask: THREE.Texture | null,
  parent: THREE.Object3D,
  sceneColor?: SceneColorCapture,
  distortion: THREE.Texture | null = null,
): ParticleDrawable => {
  const ropeTexture = repeatTexture(texture);
  const ropeMask = repeatTexture(mask);
  const ropeDistortion = repeatTexture(distortion);
  const capacity = Math.min(
    Math.max(system.spec.maxParticles, 2),
    MAX_PARTICLES,
  );
  const samples = (capacity - 1) * spec.subdivisions + 1;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(samples * 6);
  const tangents = new Float32Array(samples * 6);
  const colors = new Float32Array(samples * 8);
  const uvs = new Float32Array(samples * 4);
  const widths = new Float32Array(samples * 2);
  const edges = new Float32Array(samples * 2);
  const indices: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    edges[sample * 2] = -1;
    edges[sample * 2 + 1] = 1;
    if (sample < samples - 1) {
      const a = sample * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const attributes = {
    position: new THREE.BufferAttribute(positions, 3),
    tangent: new THREE.BufferAttribute(tangents, 3),
    tint: new THREE.BufferAttribute(colors, 4),
    uv: new THREE.BufferAttribute(uvs, 2),
    halfWidth: new THREE.BufferAttribute(widths, 1),
  };
  for (const [name, attribute] of Object.entries(attributes))
    geometry.setAttribute(name, attribute.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("edge", new THREE.BufferAttribute(edges, 1));
  const { material, sceneUniforms } = makeMaterial(
    ROPE_VERTEX,
    ropeTexture,
    ropeMask,
    spec,
    ropeDistortion,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  parent.add(mesh);
  const unregister = spec.refractive
    ? sceneColor?.register(mesh, sceneUniforms)
    : undefined;
  const order: number[] = [];
  const point = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const tint: [number, number, number] = [1, 1, 1];
  return {
    setVisible(visible) {
      mesh.visible = visible;
    },
    prepare(_camera, dirty) {
      syncMaterial(material, system, spec, ropeTexture, ropeMask);
      if (!dirty) return;
      const count = Math.min(system.count, capacity);
      const created = system.scalar(FIELD.creationTime);
      const progress = system.scalar(PATH_PROGRESS);
      order.length = count;
      for (let index = 0; index < count; index += 1) order[index] = index;
      order.sort(
        (a, b) => created[a] - created[b] || progress[a] - progress[b],
      );
      const source = system.vector(FIELD.position);
      const color = system.vector(FIELD.color);
      const radius = system.scalar(FIELD.radius);
      const alpha = system.scalar(FIELD.alpha);
      const alpha2 = system.scalar(spec.alpha2Field);
      const total = count > 1 ? (count - 1) * spec.subdivisions + 1 : 0;
      let distance = 0;
      for (let sample = 0; sample < total; sample += 1) {
        const segment = Math.min(
          Math.floor(sample / spec.subdivisions),
          count - 2,
        );
        const t = Math.min(
          (sample - segment * spec.subdivisions) / spec.subdivisions,
          1,
        );
        const a = order[Math.max(segment - 1, 0)],
          b = order[segment],
          c = order[segment + 1],
          d = order[Math.min(segment + 2, count - 1)];
        for (let component = 0; component < 3; component += 1)
          point.setComponent(
            component,
            curvePoint(
              source[a * 3 + component],
              source[b * 3 + component],
              source[c * 3 + component],
              source[d * 3 + component],
              t,
            ),
          );
        if (sample > 0) distance += previous.distanceTo(point);
        const context = system.focus(b);
        spec.colorScale.evaluate(context, tint);
        const bright = spec.overbright.evaluate(context);
        const opacity =
          THREE.MathUtils.lerp(alpha[b] * alpha2[b], alpha[c] * alpha2[c], t) *
          spec.alphaScale.evaluate(context);
        const width = Math.max(
          THREE.MathUtils.lerp(radius[b], radius[c], t) *
            spec.radiusScale.evaluate(context),
          0,
        );
        for (let edge = 0; edge < 2; edge += 1) {
          const vertex = sample * 2 + edge;
          for (let component = 0; component < 3; component += 1) {
            positions[vertex * 3 + component] = point.getComponent(component);
            tangents[vertex * 3 + component] =
              source[c * 3 + component] - source[b * 3 + component];
            colors[vertex * 4 + component] =
              THREE.MathUtils.lerp(
                color[b * 3 + component],
                color[c * 3 + component],
                t,
              ) *
              tint[component] *
              bright;
          }
          widths[vertex] = width;
          colors[vertex * 4 + 3] = Math.min(Math.max(opacity, 0), 1);
          uvs[vertex * 2] = edge;
          uvs[vertex * 2 + 1] =
            distance / Math.max(spec.textureVWorldSize, 0.001);
        }
        previous.copy(point);
      }
      geometry.setDrawRange(0, Math.max(total - 1, 0) * 6);
      for (const attribute of Object.values(attributes)) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, total * 2 * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      unregister?.();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      ropeTexture?.dispose();
      ropeMask?.dispose();
      ropeDistortion?.dispose();
    },
  };
};
