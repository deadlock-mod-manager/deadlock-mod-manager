import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/** Signed random jitter in [-0.5, 0.5). */
const jitter = (): number => Math.random() - 0.5;

const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;

/**
 * Sample a point on a rough humanoid silhouette (head, torso, arms, legs),
 * normalized to roughly y in [-1, 1] and centred on the origin.
 */
const sampleFigurePoint = (out: THREE.Vector3): void => {
  const part = Math.random();
  if (part < 0.14) {
    const r = 0.24;
    out.set(jitter() * r, 0.78 + jitter() * r * 0.9, jitter() * r * 0.8);
  } else if (part < 0.22) {
    out.set(jitter() * 0.12, 0.58 + Math.random() * 0.08, jitter() * 0.1);
  } else if (part < 0.56) {
    // Torso, tapering outward towards the shoulders.
    const y = -0.05 + Math.random() * 0.6;
    const width = 0.3 + 0.14 * ((y + 0.05) / 0.6);
    out.set(jitter() * width, y, jitter() * 0.22);
  } else if (part < 0.78) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const y = 0.5 - Math.random() * 0.85;
    out.set(
      side * (0.42 + (0.5 - y) * 0.12) + jitter() * 0.12,
      y,
      jitter() * 0.1,
    );
  } else {
    const side = Math.random() < 0.5 ? -1 : 1;
    out.set(
      side * 0.16 + jitter() * 0.16,
      -0.1 - Math.random() * 0.9,
      jitter() * 0.12,
    );
  }
};

/** Sample a point on the perimeter of a rectangle centred on the origin. */
const rectPerimeter = (
  out: THREE.Vector3,
  halfW: number,
  halfH: number,
): void => {
  const w = 2 * halfW;
  const h = 2 * halfH;
  const z = jitter() * 0.05;
  let d = Math.random() * (2 * (w + h));
  if (d < w) {
    out.set(-halfW + d, halfH, z);
  } else if ((d -= w) < h) {
    out.set(halfW, halfH - d, z);
  } else if ((d -= h) < w) {
    out.set(halfW - d, -halfH, z);
  } else {
    out.set(-halfW, -halfH + (d - w), z);
  }
};

/** A portrait hero card (3:4): a filled body inside a brighter frame. */
const sampleCardPoint = (out: THREE.Vector3): void => {
  const halfW = 0.6;
  const halfH = 0.82;
  const roll = Math.random();
  if (roll < 0.3) {
    rectPerimeter(out, halfW, halfH);
  } else if (roll < 0.42) {
    rectPerimeter(out, halfW - 0.14, 0.24);
    out.y += 0.32;
  } else {
    out.set(jitter() * 2 * halfW, jitter() * 2 * halfH, jitter() * 0.05);
  }
};

// The shape holds fully assembled until this build time, then disperses and
// rebuilds; the last stretch fades out so the reset is never seen.
const LOOP_RESET_AT = 2.8;
const LOOP_FADE_SPAN = 0.6;

/**
 * A skin that assembles itself out of glowing gold particles: points fly in from
 * a scattered cloud and snap into shape from the ground up, then rotate.
 *
 * With `loop`, it rebuilds forever, which is what makes it a loading indicator.
 * Otherwise it holds until `finish()` fades it out, so a caller can hand off to
 * a real mesh.
 */
export const createAssemblingFigure = ({
  loop = false,
  spin = 0.5,
  sampler = sampleFigurePoint,
  count = 1600,
}: {
  loop?: boolean;
  spin?: number;
  sampler?: (out: THREE.Vector3) => void;
  count?: number;
} = {}) => {
  const targets = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < count; i++) {
    sampler(point);
    targets[i * 3] = point.x;
    targets[i * 3 + 1] = point.y;
    targets[i * 3 + 2] = point.z;
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  // Higher points arrive later, so the figure builds from the feet up.
  const range = maxY - minY || 1;
  for (let i = 0; i < count; i++) {
    delays[i] = (targets[i * 3 + 1] - minY) / range;
  }

  const randomizeStarts = () => {
    for (let i = 0; i < count; i++) {
      direction
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      const spread = 1.8 + Math.random() * 2.6;
      starts[i * 3] = targets[i * 3] + direction.x * spread;
      starts[i * 3 + 1] = targets[i * 3 + 1] + direction.y * spread;
      starts[i * 3 + 2] = targets[i * 3 + 2] + direction.z * spread;
    }
  };
  randomizeStarts();

  const positions = new Float32Array(starts);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xe7c98a,
    size: 0.04,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);

  let buildTime = 0;
  let fadingOut = false;

  /** Advance the animation. True once fully faded out and safe to remove. */
  const update = (delta: number): boolean => {
    if (fadingOut) {
      material.opacity = Math.max(0, material.opacity - delta * 4);
      points.rotation.y += delta * spin;
      return material.opacity <= 0.01;
    }

    buildTime += delta / 1.7;
    if (loop && buildTime > LOOP_RESET_AT) {
      buildTime = 0;
      randomizeStarts();
    }

    const clamped = Math.min(buildTime, 1.4);
    for (let i = 0; i < count; i++) {
      const progress = easeOutCubic(
        Math.min(1, Math.max(0, (clamped - delays[i] * 0.55) / 0.7)),
      );
      for (let axis = 0; axis < 3; axis++) {
        const from = starts[i * 3 + axis];
        positions[i * 3 + axis] =
          from + (targets[i * 3 + axis] - from) * progress;
      }
    }
    geometry.attributes.position.needsUpdate = true;

    const fade = loop
      ? Math.min(1, Math.max(0, (LOOP_RESET_AT - buildTime) / LOOP_FADE_SPAN))
      : 1;
    material.opacity = Math.min(0.85, clamped * 1.6) * fade;
    points.rotation.y += delta * spin;
    return false;
  };

  return {
    points,
    update,
    finish: () => {
      fadingOut = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};

const AssemblingCanvas = ({
  className,
  sampler,
  distance,
  spin,
  count,
}: {
  className?: string;
  sampler: (out: THREE.Vector3) => void;
  distance: number;
  spin: number;
  count?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    camera.position.set(0, 0.08, distance);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const figure = createAssemblingFigure({ loop: true, sampler, spin, count });
    scene.add(figure.points);

    const clock = new THREE.Clock();
    let frame = 0;

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const render = () => {
      figure.update(clock.getDelta());
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scene.remove(figure.points);
      figure.dispose();
      // `dispose()` frees three.js resources but leaves the WebGL context
      // alive; browsers cap how many a page may hold, and this canvas is
      // mounted and unmounted on every repaint, so release it explicitly.
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [sampler, distance, spin, count]);

  return (
    <div
      aria-hidden
      className={cn("h-full w-full", className)}
      ref={containerRef}
    />
  );
};

/** A rotating hero figure, shown while a skin's model is being decoded. */
export const FoundrySkinAssembling = ({
  className,
}: {
  className?: string;
}) => (
  <AssemblingCanvas
    className={className}
    distance={4.3}
    sampler={sampleFigurePoint}
    spin={0.5}
  />
);

/**
 * A portrait card that builds and rebuilds, shown per tile while card art
 * decodes. No spin — a flat card turned edge-on would vanish — and fewer
 * particles, so a whole grid of tiles stays cheap.
 */
export const FoundryCardAssembling = ({
  className,
}: {
  className?: string;
}) => (
  <AssemblingCanvas
    className={className}
    count={650}
    distance={3.2}
    sampler={sampleCardPoint}
    spin={0}
  />
);
